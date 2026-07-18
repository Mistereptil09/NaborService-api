import { Test, TestingModule } from '@nestjs/testing';
import { StripeWebhookWorker } from '../stripe-webhook.worker';
import { PointsTopupService } from '../../../modules/points/points-topup.service';
import { PointsConnectService } from '../../../modules/points/points-connect.service';

describe('StripeWebhookWorker', () => {
  let worker: StripeWebhookWorker;

  const mockPointsTopupService = {
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
  };
  const mockPointsConnectService = {
    handleAccountUpdated: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookWorker,
        {
          provide: PointsTopupService,
          useValue: mockPointsTopupService,
        },
        {
          provide: PointsConnectService,
          useValue: mockPointsConnectService,
        },
      ],
    }).compile();

    worker = module.get<StripeWebhookWorker>(StripeWebhookWorker);
  });

  it('crédite les points sur checkout.session.completed', async () => {
    const eventData = { id: 'cs_123', metadata: { topupId: 'topup-1' } };
    const job = {
      id: 'evt_123',
      data: {
        eventType: 'checkout.session.completed',
        eventId: 'evt_123',
        eventData,
      },
    } as any;

    await expect(worker.process(job)).resolves.toBeUndefined();
    expect(mockPointsTopupService.markCompleted).toHaveBeenCalledWith(
      eventData,
    );
  });

  it('marque le topup en échec sur checkout.session.expired', async () => {
    const eventData = { id: 'cs_789', metadata: { topupId: 'topup-1' } };
    const job = {
      id: 'evt_789',
      data: {
        eventType: 'checkout.session.expired',
        eventId: 'evt_789',
        eventData,
      },
    } as any;

    await expect(worker.process(job)).resolves.toBeUndefined();
    expect(mockPointsTopupService.markFailed).toHaveBeenCalledWith(
      eventData,
      'checkout_session_expired',
    );
  });

  it("synchronise l'éligibilité au cashout sur account.updated", async () => {
    const eventData = {
      id: 'acct_123',
      charges_enabled: true,
      payouts_enabled: true,
    };
    const job = {
      id: 'evt_acct_123',
      data: {
        eventType: 'account.updated',
        eventId: 'evt_acct_123',
        eventData,
      },
    } as any;

    await expect(worker.process(job)).resolves.toBeUndefined();
    expect(mockPointsConnectService.handleAccountUpdated).toHaveBeenCalledWith(
      eventData,
    );
  });

  it('should process unhandled event types without error', async () => {
    const job = {
      id: 'evt_456',
      data: { eventType: 'unknown_event', eventId: 'evt_456', eventData: {} },
    } as any;

    await expect(worker.process(job)).resolves.toBeUndefined();
    expect(mockPointsTopupService.markCompleted).not.toHaveBeenCalled();
    expect(mockPointsTopupService.markFailed).not.toHaveBeenCalled();
    expect(
      mockPointsConnectService.handleAccountUpdated,
    ).not.toHaveBeenCalled();
  });
});
