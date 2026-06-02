import { Controller, Post, Req, Res, Headers, Logger } from '@nestjs/common';
import { ApiTags, ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';

@ApiTags('Events Stripe')
@ApiExcludeController()
@Controller('events/stripe')
export class EventsStripeController {
  private readonly logger = new Logger(EventsStripeController.name);

  @Post('webhook')
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ) {
    // Mock webhook handler for Stripe
    this.logger.log(
      `Received Stripe webhook: ${req.body?.type || 'unknown type'}`,
    );

    try {
      // Typically we would verify the signature here using stripe.webhooks.constructEvent
      // const event = stripe.webhooks.constructEvent(req.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);

      const event = req.body;

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        this.logger.log(`Payment success for session ${session.id}`);
        // Handle payment success (update payment_status to completed, emit ticket, etc.)
      }

      res.status(200).send({ received: true });
    } catch (err) {
      this.logger.error(`Webhook Error: ${err.message}`);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
}
