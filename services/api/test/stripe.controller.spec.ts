import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { StripeController } from '../src/modules/stripe/stripe.controller';
import { StripeService } from '../src/modules/stripe/stripe.service';
import { ListingTransactionService } from '../src/modules/listings/listing-transaction.service';
import { ListingStatusEnum, TransactionStatusEnum } from '../src/common/enums';

describe('StripeController', () => {
  let controller: StripeController;

  const mockStripeService = {
    createCheckoutSession: jest.fn(),
    constructWebhookEvent: jest.fn(),
  };

  const mockTransactionService = {
    findByListingId: jest.fn(),
    save: jest.fn(),
    markPaid: jest.fn(),
    markPaymentFailed: jest.fn(),
  };

  const mockStripeWebhookQueue = {
    add: jest.fn(),
  };

  const baseTransaction = () => ({
    id: 'tx-1',
    requesterId: 'user-requester',
    status: TransactionStatusEnum.PENDING,
    amountCents: 4550,
    paidAt: null as Date | null,
    stripeSessionId: null as string | null,
    listing: { status: ListingStatusEnum.IN_PROGRESS, title: 'Ménage complet' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeController],
      providers: [
        { provide: StripeService, useValue: mockStripeService },
        {
          provide: ListingTransactionService,
          useValue: mockTransactionService,
        },
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

  describe('createPaiementLink', () => {
    it('crée une session de paiement pour le requester', async () => {
      const transaction = baseTransaction();
      mockTransactionService.findByListingId.mockResolvedValue(transaction);
      mockStripeService.createCheckoutSession.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test-session-url',
      });

      const req = { user: { sub: 'user-requester' } };
      const result = await controller.createPaiementLink('listing-1', req);

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith({
        transactionId: 'tx-1',
        listingId: 'listing-1',
        amountCents: 4550,
        productName: 'Ménage complet',
      });
      expect(transaction.stripeSessionId).toBe('cs_test_123');
      expect(mockTransactionService.save).toHaveBeenCalledWith(transaction);
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/test-session-url',
      });
    });

    it("refuse si l'appelant n'est pas le requester", async () => {
      mockTransactionService.findByListingId.mockResolvedValue(
        baseTransaction(),
      );

      const req = { user: { sub: 'someone-else' } };
      await expect(
        controller.createPaiementLink('listing-1', req),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('refuse si la transaction est déjà payée', async () => {
      mockTransactionService.findByListingId.mockResolvedValue({
        ...baseTransaction(),
        paidAt: new Date(),
      });

      const req = { user: { sub: 'user-requester' } };
      await expect(
        controller.createPaiementLink('listing-1', req),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuse si l'annonce n'est pas en cours", async () => {
      mockTransactionService.findByListingId.mockResolvedValue({
        ...baseTransaction(),
        listing: { status: ListingStatusEnum.PENDING, title: 'Ménage complet' },
      });

      const req = { user: { sub: 'user-requester' } };
      await expect(
        controller.createPaiementLink('listing-1', req),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('handleWebhook', () => {
    const rawBody = Buffer.from('payload');

    it('met en file le job avec le jobId = event.id sur signature valide', async () => {
      mockStripeService.constructWebhookEvent.mockReturnValue({
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: { id: 'pi_123', metadata: { transactionId: 'tx-1' } },
        },
      });

      const result = await controller.handleWebhook('sig_valid', {
        rawBody,
      } as any);

      expect(mockStripeWebhookQueue.add).toHaveBeenCalledWith(
        'payment_intent.succeeded',
        {
          eventType: 'payment_intent.succeeded',
          eventId: 'evt_123',
          eventData: { id: 'pi_123', metadata: { transactionId: 'tx-1' } },
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
