import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

interface CreateCheckoutSessionParams {
  transactionId: string;
  listingId: string;
  amountCents: number;
  productName: string;
}

// Stripe's default export only re-exposes the `Stripe` class type, not its
// nested namespace (Checkout, Event, ...) — derive what we need from method signatures instead.
export type StripeCheckoutSession = Awaited<
  ReturnType<Stripe.Stripe['checkout']['sessions']['create']>
>;
export type StripeWebhookEvent = ReturnType<
  Stripe.Stripe['webhooks']['constructEvent']
>;

@Injectable()
export class StripeService {
  private stripe: Stripe.Stripe;
  private webhookSecret: string;

  constructor(private configService: ConfigService) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not defined');
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2026-06-24.dahlia',
    });

    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not defined');
    this.webhookSecret = webhookSecret;
  }

  async createCheckoutSession({
    transactionId,
    listingId,
    amountCents,
    productName,
  }: CreateCheckoutSessionParams): Promise<StripeCheckoutSession> {
    const frontendUrl = this.configService.get<string>(
      'CORS_ORIGIN',
      'http://localhost:5173',
    );

    return this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: productName,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: {
        transactionId,
      },
      // payment_intent.succeeded/payment_intent.payment_failed webhooks only see
      // the PaymentIntent's own metadata, not the Checkout Session's.
      payment_intent_data: {
        metadata: {
          transactionId,
        },
      },
      success_url: `${frontendUrl}/listings/${listingId}?payment=success`,
      cancel_url: `${frontendUrl}/listings/${listingId}?payment=cancel`,
    });
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): StripeWebhookEvent {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }
}
