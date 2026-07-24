import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeService } from '../stripe.service';

describe('StripeService.constructWebhookEvent', () => {
  const webhookSecret = 'whsec_test_secret';
  let stripeService: StripeService;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
        if (key === 'STRIPE_WEBHOOK_SECRET') return webhookSecret;
        return undefined;
      }),
    } as unknown as ConfigService;

    stripeService = new StripeService(configService);
  });

  function sign(payload: string, secret: string): string {
    return Stripe.webhooks.generateTestHeaderString({ payload, secret });
  }

  it('accepts a correctly signed payload and returns the parsed event', () => {
    const payload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123', metadata: { topupId: 'topup-1' } } },
    });
    const signature = sign(payload, webhookSecret);

    const event = stripeService.constructWebhookEvent(
      Buffer.from(payload),
      signature,
    );

    expect(event.id).toBe('evt_test_123');
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects a payload signed with the wrong secret', () => {
    const payload = JSON.stringify({
      id: 'evt_test_456',
      type: 'checkout.session.completed',
    });
    const signature = sign(payload, 'whsec_wrong_secret');

    expect(() =>
      stripeService.constructWebhookEvent(Buffer.from(payload), signature),
    ).toThrow();
  });

  it('rejects a payload tampered with after signing', () => {
    const originalPayload = JSON.stringify({
      id: 'evt_test_789',
      type: 'checkout.session.completed',
    });
    const signature = sign(originalPayload, webhookSecret);
    const tamperedPayload = JSON.stringify({
      id: 'evt_test_789',
      type: 'account.updated',
    });

    expect(() =>
      stripeService.constructWebhookEvent(
        Buffer.from(tamperedPayload),
        signature,
      ),
    ).toThrow();
  });

  it('accepts a correctly signed account.updated payload (cashout onboarding)', () => {
    const payload = JSON.stringify({
      id: 'evt_test_acct_123',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_123',
          charges_enabled: true,
          payouts_enabled: true,
        },
      },
    });
    const signature = sign(payload, webhookSecret);

    const event = stripeService.constructWebhookEvent(
      Buffer.from(payload),
      signature,
    );

    expect(event.id).toBe('evt_test_acct_123');
    expect(event.type).toBe('account.updated');
  });

  it('rejects a signature whose timestamp is outside the tolerance window', () => {
    const payload = JSON.stringify({
      id: 'evt_test_stale',
      type: 'checkout.session.completed',
    });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: staleTimestamp,
    });

    expect(() =>
      stripeService.constructWebhookEvent(Buffer.from(payload), signature),
    ).toThrow();
  });
});
