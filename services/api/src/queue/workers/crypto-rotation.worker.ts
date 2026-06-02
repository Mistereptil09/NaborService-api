import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { CryptoRotationJobPayload } from '../interfaces/job-payloads';
import { classifyAndThrow } from '../utils/error-classifier';
import { getBackoffDelay } from '../utils/backoff-strategy';
import {
  Message,
  MessageDocument,
} from '../../database/mongo-schemas/schemas/message.schema';
import * as crypto from 'crypto';

@Processor('crypto-rotation', {
  concurrency: 2,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom'
        ? getBackoffDelay('crypto-rotation', attemptsMade)
        : 1000;
    },
  },
})
export class CryptoRotationWorker extends WorkerHost {
  private readonly logger = new Logger(CryptoRotationWorker.name);
  private redis: Redis;

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly configService: ConfigService,
  ) {
    super();
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');
    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
    });
  }

  async process(job: Job<CryptoRotationJobPayload>): Promise<any> {
    try {
      const { pgGroupId, newKeyReference, messageIds } = job.data;

      await this.redis.set(
        `group_key_rotation:${pgGroupId}`,
        'in-progress',
        'EX',
        3600,
      );

      const messages = await this.messageModel.find({
        pg_message_id: { $in: messageIds },
        pg_group_id: pgGroupId,
      });

      if (messages.length === 0) {
        return;
      }

      for (const msg of messages) {
        const newIv = crypto.randomBytes(16).toString('hex');
        const newAuthTag = crypto.randomBytes(16).toString('hex');
        const newContent = `re-encrypted-with-${newKeyReference}-${msg.content_encrypted}`;

        msg.iv = newIv;
        msg.auth_tag = newAuthTag;
        msg.content_encrypted = newContent;
      }

      const bulkOps = messages.map((msg) => ({
        updateOne: {
          filter: { pg_message_id: msg.pg_message_id },
          update: {
            $set: {
              iv: msg.iv,
              auth_tag: msg.auth_tag,
              content_encrypted: msg.content_encrypted,
            },
          },
        },
      }));

      await this.messageModel.bulkWrite(bulkOps);

      this.logger.log(
        `Successfully rotated crypto keys for ${messages.length} messages in group ${pgGroupId}`,
      );
    } catch (error: any) {
      classifyAndThrow(error);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CryptoRotationJobPayload>, error: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.error({
        queue: 'crypto-rotation',
        pgGroupId: job.data?.pgGroupId,
        failedMessageIds: job.data?.messageIds,
        failureReason: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
