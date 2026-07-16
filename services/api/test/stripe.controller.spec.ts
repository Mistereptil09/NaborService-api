import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { StripeController } from '../src/modules/stripe/stripe.controller';
import { StripeService } from '../src/modules/stripe/stripe.service';

describe('StripeController', () => {
  let controller: StripeController;

  const mockStripeService = {
    createCheckoutSession: jest.fn(),
    constructWebhookEvent: jest.fn(),
  };

  const mockStripeWebhookQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeController],
      providers: [
        { provide: StripeService, useValue: mockStripeService },
        {
          provide: getQueueToken('stripe-webhook'),
          useValue: mockStripeWebhookQueue,
        },
      ],
    }).compile();

    controller = module.get<StripeController>(StripeController);
  });

  it('devrait être défini', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    const rawBody = Buffer.from('payload');

    it('met en file le job avec le jobId = event.id sur signature valide', async () => {
      mockStripeService.constructWebhookEvent.mockReturnValue({
        id: 'evt_123',
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_123', metadata: { topupId: 'topup-1' } },
        },
      });

      const result = await controller.handleWebhook('sig_valid', {
        rawBody,
      } as any);

      expect(mockStripeWebhookQueue.add).toHaveBeenCalledWith(
        'checkout.session.completed',
        {
          eventType: 'checkout.session.completed',
          eventId: 'evt_123',
          eventData: { id: 'cs_123', metadata: { topupId: 'topup-1' } },
        },
        { jobId: 'evt_123' },
      );
      expect(result).toEqual({ received: true });
    });

    it('rejette une signature invalide', async () => {
      mockStripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(
        controller.handleWebhook('sig_invalid', { rawBody } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockStripeWebhookQueue.add).not.toHaveBeenCalled();
    });

    it('rejette une requête sans en-tête de signature', async () => {
      await expect(
        controller.handleWebhook(undefined as any, { rawBody } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockStripeWebhookQueue.add).not.toHaveBeenCalled();
    });
  });
});
