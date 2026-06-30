import {
  Controller,
  Post,
  Param,
  Headers,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { StripeService } from './stripe.service';
import type { StripeWebhookEvent } from './stripe.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListingTransactionService } from '../listings/listing-transaction.service';
import { ListingStatusEnum, TransactionStatusEnum } from '../../common/enums';
import type { StripeWebhookJobPayload } from '../../queue/interfaces/job-payloads';
import { stripeJobId } from '../../queue/utils/job-id';

@ApiTags('stripe')
@Controller('stripe')
export class StripeController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly transactionService: ListingTransactionService,
    @InjectQueue('stripe-webhook')
    private readonly stripeWebhookQueue: Queue<StripeWebhookJobPayload>,
  ) {}

  @Post('checkout/:listing_id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a checkout session for a listing transaction',
  })
  async createPaiementLink(
    @Param('listing_id') listingId: string,
    @Req() req: any,
  ) {
    const transaction =
      await this.transactionService.findByListingId(listingId);

    if (transaction.requesterId !== req.user.sub) {
      throw new ForbiddenException('Action non autorisée');
    }

    if (
      transaction.listing.status !== ListingStatusEnum.IN_PROGRESS ||
      transaction.status !== TransactionStatusEnum.PENDING ||
      transaction.paidAt
    ) {
      throw new ConflictException('Cette transaction ne peut pas être payée');
    }

    const session = await this.stripeService.createCheckoutSession({
      transactionId: transaction.id,
      listingId,
      amountCents: transaction.amountCents,
      productName: transaction.listing.title,
    });

    transaction.stripeSessionId = session.id;
    await this.transactionService.save(transaction);

    return { url: session.url };
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Écoute les événements Stripe' })
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
