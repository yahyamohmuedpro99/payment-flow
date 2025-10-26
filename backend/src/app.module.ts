import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Configuration
import { appConfig } from './config/app.config';
import { jwtConfig } from './config/jwt.config';
import { redisConfig } from './config/redis.config';
import { stripeConfig } from './config/stripe.config';

// Modules
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { WalletsModule } from './wallets/wallets.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';

// Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

// Filters
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, redisConfig, stripeConfig],
    }),

    // Global cache (Redis)
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: redisConfig,
    }),

    // Database
    DatabaseModule,

    // Feature modules
    AuthModule,
    WalletsModule,
    ProductsModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // Global guards
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Apply JWT guard globally
    },

    // Global exception filters
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
  ],
})
export class AppModule {}
