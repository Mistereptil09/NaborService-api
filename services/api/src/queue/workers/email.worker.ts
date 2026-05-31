import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailJobPayload } from '../interfaces/job-payloads';
import { classifyAndThrow } from '../utils/error-classifier';
import { getBackoffDelay } from '../utils/backoff-strategy';
import { validateEmailPayload } from '../validators/email-payload.validator';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { UserPreferencesService } from '../../modules/users/user-preferences.service';

@Processor('email', {
  concurrency: 10,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom' ? getBackoffDelay('email', attemptsMade) : 1000;
    },
  },
})
export class EmailWorker extends WorkerHost {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userPreferencesService: UserPreferencesService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    try {
      if (!validateEmailPayload(job.data)) {
        throw new UnrecoverableError(`Invalid email payload for job ${job.id}`);
      }

      const payload = job.data as EmailJobPayload;

      // 1. Resolve User by email
      const user = await this.dataSource.getRepository(User).findOne({ where: { email: payload.recipient } });

      if (user) {
        const canReceive = await this.userPreferencesService.canReceiveEmail(user.id, payload.templateName);
        if (!canReceive) {
          this.logger.log(`Skipping email to ${payload.recipient} (Template: ${payload.templateName}): opted out via preferences`);
          return { skipped: true, reason: 'user_preference_opt_out' };
        }
      }

      // Invoking mock email transport service
      this.logger.log(`Sending email to ${payload.recipient} (Template: ${payload.templateName})`);

    } catch (error: any) {
      classifyAndThrow(error);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.error({
        queue: 'email',
        jobId: job.id,
        recipient: job.data?.recipient,
        templateName: job.data?.templateName,
        failureReason: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
