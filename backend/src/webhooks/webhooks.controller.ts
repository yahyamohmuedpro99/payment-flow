import {
  Controller,
  Post,
  Headers,
  RawBodyRequest,
  Req,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from '../common/services/stripe.service';
import { OrdersService } from '../orders/orders.service';
import { Public } from '../common/decorators/public.decorator';

/**
 * Webhooks Controller
 * Handles webhooks from external services (Stripe)
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Stripe webhook endpoint
   * Handles payment confirmation events
   */
  @Public()
  @Post('stripe')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    this.logger.log('Received Stripe webhook');

    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // Get raw body (important for signature verification)
    const rawBody = request.rawBody;

    if (!rawBody) {
      throw new BadRequestException('Missing request body');
    }

    let event;

    try {
      // Verify webhook signature
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
      this.logger.log(`Verified webhook event: ${event.type}`);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Invalid signature');
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          this.logger.log(`Checkout session completed: ${session.id}`);

          // Complete the order
          await this.ordersService.completeGatewayOrder(
            session.id,
            session.payment_intent as string,
          );

          this.logger.log(`Order completed for session: ${session.id}`);
          break;
        }

        case 'checkout.session.expired': {
          const session = event.data.object;
          this.logger.warn(`Checkout session expired: ${session.id}`);
          // Could mark order as failed here
          break;
        }

        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object;
          this.logger.log(`Payment intent succeeded: ${paymentIntent.id}`);
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object;
          this.logger.error(`Payment intent failed: ${paymentIntent.id}`);
          // Could mark order as failed here
          break;
        }

        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error.message}`);
      throw new BadRequestException('Webhook processing failed');
    }
  }
}
