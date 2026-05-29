import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookWorker } from '../stripe-webhook.worker';

describe('StripeWebhookWorker', () => {
  let worker: StripeWebhookWorker;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StripeWebhookWorker],
    }).compile();

    worker = module.get<StripeWebhookWorker>(StripeWebhookWorker);
  });

  it('should process payment_intent.succeeded', async () => {
    const job = {
      id: 'evt_123',
      data: { eventType: 'payment_intent.succeeded', eventId: 'evt_123', eventData: {} }
    } as any;
    
    await expect(worker.process(job)).resolves.toBeUndefined();
  });

  it('should process unhandled event types without error', async () => {
    const job = {
      id: 'evt_456',
      data: { eventType: 'unknown_event', eventId: 'evt_456', eventData: {} }
    } as any;
    
    await expect(worker.process(job)).resolves.toBeUndefined();
  });
});
