import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { StripeService } from '../common/services/stripe.service';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [WebhooksController],
  providers: [StripeService],
})
export class WebhooksModule {}
