import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { StripeWebhookJobPayload } from '../interfaces/job-payloads';
import { classifyAndThrow } from '../utils/error-classifier';
import { getBackoffDelay } from '../utils/backoff-strategy';
import { PointsTopupService } from '../../modules/points/points-topup.service';

/**
 * Processes Stripe webhooks.
 * Note on idempotency: The producer MUST set `jobId` to the Stripe event ID.
 * BullMQ silently ignores duplicate adds with the same jobId, ensuring webhooks
 * are not processed multiple times.
 */
@Processor('stripe-webhook', {
  concurrency: 5,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom'
        ? getBackoffDelay('stripe-webhook', attemptsMade)
        : 1000;
    },
  },
})
export class StripeWebhookWorker extends WorkerHost {
  private readonly logger = new Logger(StripeWebhookWorker.name);

  constructor(private readonly pointsTopupService: PointsTopupService) {
    super();
  }

  async process(job: Job<StripeWebhookJobPayload>): Promise<any> {
    try {
      const { eventType, eventId, eventData } = job.data;

      if (job.id !== eventId) {
        this.logger.warn(
          `Job ID (${job.id}) does not match Stripe Event ID (${eventId})`,
        );
      }

      this.logger.log(
        `Processing Stripe webhook: ${eventType} (Event ID: ${eventId})`,
      );

      switch (eventType) {
        case 'checkout.session.completed': {
          await this.pointsTopupService.markCompleted(eventData);
          break;
        }
        case 'checkout.session.expired': {
          await this.pointsTopupService.markFailed(
            eventData,
            'checkout_session_expired',
          );
          break;
        }
        default:
          this.logger.log(`Unhandled Stripe event type: ${eventType}`);
      }
    } catch (error: any) {
      classifyAndThrow(error);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<StripeWebhookJobPayload>, error: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.error({
        queue: 'stripe-webhook',
        jobName: job.name,
        stripeEventId: job.data?.eventId,
        failureReason: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
