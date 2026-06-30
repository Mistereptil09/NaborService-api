import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookWorker } from '../stripe-webhook.worker';
import { ListingTransactionService } from '../../../modules/listings/listing-transaction.service';

describe('StripeWebhookWorker', () => {
  let worker: StripeWebhookWorker;

  const mockTransactionService = {
    markPaid: jest.fn(),
    markPaymentFailed: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookWorker,
        {
          provide: ListingTransactionService,
          useValue: mockTransactionService,
        },
      ],
    }).compile();

    worker = module.get<StripeWebhookWorker>(StripeWebhookWorker);
  });

  it('marque la transaction payée sur payment_intent.succeeded', async () => {
    const job = {
      id: 'evt_123',
      data: {
        eventType: 'payment_intent.succeeded',
        eventId: 'evt_123',
        eventData: { id: 'pi_123', metadata: { transactionId: 'tx-1' } },
      },
    } as any;

    await expect(worker.process(job)).resolves.toBeUndefined();
    expect(mockTransactionService.markPaid).toHaveBeenCalledWith(
      'tx-1',
      'pi_123',
    );
  });

  it('marque la transaction en échec sur payment_intent.payment_failed', async () => {
    const job = {
      id: 'evt_789',
      data: {
        eventType: 'payment_intent.payment_failed',
        eventId: 'evt_789',
        eventData: {
          id: 'pi_789',
          metadata: { transactionId: 'tx-1' },
          last_payment_error: { message: 'Your card was declined.' },
        },
      },
    } as any;

    await expect(worker.process(job)).resolves.toBeUndefined();
    expect(mockTransactionService.markPaymentFailed).toHaveBeenCalledWith(
      'tx-1',
      'Your card was declined.',
    );
  });

  it('ignore les événements sans transactionId en métadonnées', async () => {
    const job = {
      id: 'evt_999',
      data: {
        eventType: 'payment_intent.succeeded',
        eventId: 'evt_999',
        eventData: { id: 'pi_999', metadata: {} },
      },
    } as any;

    await expect(worker.process(job)).resolves.toBeUndefined();
    expect(mockTransactionService.markPaid).not.toHaveBeenCalled();
  });

  it('should process unhandled event types without error', async () => {
    const job = {
      id: 'evt_456',
      data: { eventType: 'unknown_event', eventId: 'evt_456', eventData: {} },
    } as any;

    await expect(worker.process(job)).resolves.toBeUndefined();
    expect(mockTransactionService.markPaid).not.toHaveBeenCalled();
    expect(mockTransactionService.markPaymentFailed).not.toHaveBeenCalled();
  });
});
