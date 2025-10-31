import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { cleanupTestDatabase, disconnectDatabase } from './setup';

describe('Payment Flow E2E Tests', () => {
  let app: INestApplication;
  let userAccessToken: string;
  let merchantAccessToken: string;
  let productId: string;
  let userId: string;
  let merchantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.setGlobalPrefix('api/v1');

    await app.init();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await disconnectDatabase();
    await app.close();
  });

  describe('1. Authentication Flow', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'testuser@example.com',
          password: 'Test123!@#',
          role: 'USER',
        })
        .expect(201)
        .then((response) => {
          expect(response.body).toHaveProperty('user');
          expect(response.body).toHaveProperty('accessToken');
          expect(response.body).toHaveProperty('refreshToken');
          expect(response.body.user.email).toBe('testuser@example.com');
          expect(response.body.user.role).toBe('USER');

          userAccessToken = response.body.accessToken;
          userId = response.body.user.id;
        });
    });

    it('should register a merchant', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'merchant@example.com',
          password: 'Merchant123!@#',
          role: 'MERCHANT',
        })
        .expect(201)
        .then((response) => {
          expect(response.body.user.role).toBe('MERCHANT');
          merchantAccessToken = response.body.accessToken;
          merchantId = response.body.user.id;
        });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'Test123!@#',
        })
        .expect(200)
        .then((response) => {
          expect(response.body).toHaveProperty('accessToken');
          expect(response.body).toHaveProperty('refreshToken');
        });
    });

    it('should reject invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });
  });

  describe('2. Wallet Operations', () => {
    it('should deposit funds to wallet', () => {
      return request(app.getHttpServer())
        .post('/api/v1/wallet/deposit')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({ amount: 1000.0 })
        .expect(200)
        .then((response) => {
          expect(response.body).toHaveProperty('wallet');
          expect(response.body).toHaveProperty('transaction');
          expect(Number(response.body.wallet.balance)).toBe(1000.0);
        });
    });

    it('should withdraw funds from wallet', () => {
      return request(app.getHttpServer())
        .post('/api/v1/wallet/withdraw')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({ amount: 100.0 })
        .expect(200)
        .then((response) => {
          expect(Number(response.body.wallet.balance)).toBe(900.0);
        });
    });
  });

  describe('3. Product Management', () => {
    it('should create a product (merchant only)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${merchantAccessToken}`)
        .send({
          name: 'Test Product',
          description: 'Test Description',
          price: 299.99,
          availableUnits: 10,
        })
        .expect(201)
        .then((response) => {
          productId = response.body.id;
          expect(response.body.name).toBe('Test Product');
        });
    });

    it('should list all products', () => {
      return request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(200)
        .then((response) => {
          expect(Array.isArray(response.body)).toBe(true);
        });
    });
  });

  describe('4. Order/Purchase Flow', () => {
    it('should create order with wallet payment', () => {
      return request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({
          productId,
          paymentMethod: 'WALLET',
        })
        .expect(201)
        .then((response) => {
          expect(response.body.status).toBe('COMPLETED');
        });
    });
  });
});
