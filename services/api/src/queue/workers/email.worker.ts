import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailJobPayload } from '../interfaces/job-payloads';
import { classifyAndThrow } from '../utils/error-classifier';
import { getBackoffDelay } from '../utils/backoff-strategy';
import { validateEmailPayload } from '../validators/email-payload.validator';

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

  async process(job: Job): Promise<any> {
    try {
      if (!validateEmailPayload(job.data)) {
        throw new UnrecoverableError(`Invalid email payload for job ${job.id}`);
      }

      const payload = job.data as EmailJobPayload;

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
