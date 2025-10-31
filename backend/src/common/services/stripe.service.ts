import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Stripe Service
 * Handles Stripe API interactions for payment processing
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('stripe.secretKey') ||
                      this.configService.get<string>('STRIPE_SECRET_KEY') ||
                      process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-09-30.clover',
      typescript: true,
    });

    this.logger.log('Stripe service initialized');
  }

  /**
   * Create a checkout session for product purchase
   */
  async createCheckoutSession(
    productId: string,
    productName: string,
    productPrice: number,
    quantity: number,
    userId: string,
    userEmail: string,
  ): Promise<Stripe.Checkout.Session> {
    this.logger.log(`Creating checkout session for user ${userId}, product ${productId}`);

    const successUrl = this.configService.get<string>('stripe.successUrl') || 'http://localhost:3001/payment/success';
    const cancelUrl = this.configService.get<string>('stripe.cancelUrl') || 'http://localhost:3001/payment/cancel';

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
              description: `Purchase from Payment Flow`,
            },
            unit_amount: Math.round(productPrice * 100), // Convert to cents
          },
          quantity,
        },
      ],
      mode: 'payment',
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cancelUrl}?session_id={CHECKOUT_SESSION_ID}`,
      customer_email: userEmail,
      metadata: {
        userId,
        productId,
        quantity: quantity.toString(),
      },
      payment_intent_data: {
        metadata: {
          userId,
          productId,
          quantity: quantity.toString(),
        },
      },
    });

    this.logger.log(`Checkout session created: ${session.id}`);
    return session;
  }

  /**
   * Retrieve a checkout session by ID
   */
  async retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.retrieve(sessionId);
  }

  /**
   * Verify webhook signature
   */
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    const webhookSecret = this.configService.get<string>('stripe.webhookSecret') ||
                         this.configService.get<string>('STRIPE_WEBHOOK_SECRET') ||
                         process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  /**
   * Get Stripe instance (for advanced operations)
   */
  getStripeInstance(): Stripe {
    return this.stripe;
  }
}
