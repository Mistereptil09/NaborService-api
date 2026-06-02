import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import { RgpdAnonymiseJobPayload } from '../interfaces/job-payloads';
import { classifyAndThrow } from '../utils/error-classifier';
import { getBackoffDelay } from '../utils/backoff-strategy';
import { User } from '../../modules/users/entities/user.entity';
import { UserSession } from '../../common/entities/user-session.entity';

@Processor('rgpd-anonymise', {
  concurrency: 1,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom'
        ? getBackoffDelay('rgpd-anonymise', attemptsMade)
        : 1000;
    },
  },
})
export class RgpdAnonymiseWorker extends WorkerHost {
  private readonly logger = new Logger(RgpdAnonymiseWorker.name);

  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async process(job: Job<RgpdAnonymiseJobPayload>): Promise<any> {
    try {
      const { userId } = job.data;

      await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, {
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!user) {
          throw new UnrecoverableError(`User ${userId} not found`);
        }

        const randomSuffix = crypto.randomBytes(8).toString('hex');
        user.firstName = `Anonymized-${randomSuffix}`;
        user.lastName = `Anonymized-${randomSuffix}`;
        user.email = `anonymized-${randomSuffix}@deleted.user`;

        user.bio = null;
        user.profilePictureMongoId = null;
        user.bannerMongoId = null;
        user.stripeAccountId = null;
        user.totpSecret = null;

        await manager.save(user);

        await manager.update(
          UserSession,
          {
            userId,
            revokedAt: IsNull(),
            expiresAt: MoreThan(new Date()),
          },
          {
            revokedAt: new Date(),
          },
        );
      });

      this.logger.log(`Successfully anonymized user ${job.data.userId}`);
    } catch (error: any) {
      if (error instanceof UnrecoverableError) {
        throw error;
      }
      classifyAndThrow(error);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RgpdAnonymiseJobPayload>, error: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.error({
        queue: 'rgpd-anonymise',
        userId: job.data?.userId,
        failureReason: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
