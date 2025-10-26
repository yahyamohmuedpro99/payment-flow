import { registerAs } from '@nestjs/config';

export const stripeConfig = registerAs('stripe', () => ({
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  successUrl: process.env.STRIPE_SUCCESS_URL || 'http://localhost:3000/api/v1/payments/success',
  cancelUrl: process.env.STRIPE_CANCEL_URL || 'http://localhost:3000/api/v1/payments/cancel',
}));
