import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';

interface CreateCheckoutSessionParams {
  amountCents: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

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
  private connectWebhookSecret?: string;

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
    this.connectWebhookSecret = this.configService.get<string>(
      'STRIPE_CONNECT_WEBHOOK_SECRET',
    );
  }
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): StripeWebhookEvent {
    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      if (!this.connectWebhookSecret) throw err;
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.connectWebhookSecret,
      );
    }
  }

  async createCheckoutSession({
    amountCents,
    productName,
    successUrl,
    cancelUrl,
    metadata,
  }: CreateCheckoutSessionParams): Promise<StripeCheckoutSession> {
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
      metadata,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createConnectAccount(email: string): Promise<string> {
    const account = await this.stripe.accounts.create({
      type: 'express',
      email,
      capabilities: { transfers: { requested: true } },
    });
    return account.id;
  }

  async createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return link.url;
  }

  async createTransfer(
    amountCents: number,
    destinationAccountId: string,
    metadata: Record<string, string>,
  ): Promise<{ id: string }> {
    const transfer = await this.stripe.transfers.create({
      amount: amountCents,
      currency: 'eur',
      destination: destinationAccountId,
      metadata,
    });
    return { id: transfer.id };
  }
}
