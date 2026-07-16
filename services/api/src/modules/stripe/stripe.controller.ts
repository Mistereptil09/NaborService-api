import { Controller, Post, Headers, Req, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { StripeService } from './stripe.service';
import type { StripeWebhookEvent } from './stripe.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { StripeWebhookJobPayload } from '../../queue/interfaces/job-payloads';
import { stripeJobId } from '../../queue/utils/job-id';

@ApiTags('stripe')
@Controller('stripe')
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    @InjectQueue('stripe-webhook')
    private readonly stripeWebhookQueue: Queue<StripeWebhookJobPayload>,
  ) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Écoute les événements Stripe (achat de points)' })
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: StripeWebhookEvent;

    try {
      event = this.stripeService.constructWebhookEvent(req.rawBody!, signature);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`⚠️ Erreur de signature Webhook : ${errorMessage}`);
      throw new BadRequestException(`Webhook Error: ${errorMessage}`);
    }

    // Acknowledge fast; StripeWebhookWorker does the actual processing
    // (jobId = event.id gives BullMQ-level dedup against Stripe retries).
    await this.stripeWebhookQueue.add(
      event.type,
      {
        eventType: event.type,
        eventId: event.id,
        eventData: event.data.object as Record<string, any>,
      },
      { jobId: stripeJobId(event.id) },
    );

    return { received: true };
  }
}
