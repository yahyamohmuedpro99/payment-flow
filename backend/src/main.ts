import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Enable raw body for webhook signature verification
  });
  const configService = app.get(ConfigService);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: configService.get<string>('app.frontendUrl'),
    credentials: true,
  });

  // Global prefix
  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('Payment Flow API')
    .setDescription('Fintech-style payment backend with wallet system, product management, and order processing')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'User registration, login, and token refresh')
    .addTag('Wallets', 'Wallet operations - deposit, withdraw, balance, transactions')
    .addTag('Products', 'Product management - CRUD operations for merchants')
    .addTag('Orders', 'Order/Purchase flow - wallet and gateway payments')
    .addTag('Webhooks', 'External webhooks - Stripe payment notifications')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Payment Flow API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = configService.get<number>('app.port') || 3000;
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log(`Environment: ${configService.get<string>('app.nodeEnv')}`);
}

bootstrap();
