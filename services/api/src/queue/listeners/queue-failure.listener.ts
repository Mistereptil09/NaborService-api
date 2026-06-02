import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class QueueFailureListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('QueueFailureListener');
  private readonly queueEventsList: QueueEvents[] = [];

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');
    const connection = { host, port, password };

    const queues = [
      'neo4j-sync',
      'email',
      'pdf-generation',
      'stripe-webhook',
      'waitlist-promote',
      'rgpd-anonymise',
      'crypto-rotation',
      'event-register',
      'contract-expiration',
    ];

    for (const queueName of queues) {
      const queueEvents = new QueueEvents(queueName, { connection });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        this.logger.error({
          event: 'job_failed',
          queue: queueName,
          jobId,
          failureReason: failedReason,
          timestamp: new Date().toISOString(),
        });
      });

      this.queueEventsList.push(queueEvents);
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.queueEventsList.map((qe) => qe.close()));
  }
}
