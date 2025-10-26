import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';

@Module({
  imports: [ConfigModule],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService], // Export for use in orders module
})
export class WalletsModule {}
