import { registerAs } from '@nestjs/config';

export const stripeConfig = registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  successUrl: process.env.STRIPE_SUCCESS_URL || 'http://localhost:3001/payment/success',
  cancelUrl: process.env.STRIPE_CANCEL_URL || 'http://localhost:3001/payment/cancel',
}));
