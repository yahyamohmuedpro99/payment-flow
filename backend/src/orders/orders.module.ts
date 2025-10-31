import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { StripeService } from '../common/services/stripe.service';

@Module({
  imports: [ConfigModule, WalletsModule],
  controllers: [OrdersController],
  providers: [OrdersService, StripeService],
  exports: [OrdersService],
})
export class OrdersModule {}
