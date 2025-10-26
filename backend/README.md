# Payment Flow - Backend API

Production-grade fintech backend system for digital product sales with wallet and payment gateway integration.

**Backend Engineer Assessment - NestJS + Prisma + PostgreSQL**

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Architecture](#architecture)
- [Security](#security)

## Features

✅ **Authentication & Authorization**
- JWT-based authentication with access and refresh tokens
- Role-based access control (User/Merchant)
- Password hashing with bcrypt (cost factor: 12)

✅ **Wallet System**
- Deposit and withdrawal operations
- Complete transaction audit trail
- Atomic balance updates
- Overdraft prevention
- Transaction history with pagination

✅ **Product Management**
- Merchants can create and manage digital products
- Limited stock management with pessimistic locking
- Product caching with Redis (60s TTL)
- Only product owners can update/delete

✅ **Order/Purchase Flow**
- Wallet payment support
- Atomic stock management (SELECT FOR UPDATE)
- Race condition prevention
- Complete order history

✅ **Security & Performance**
- Global input validation
- SQL injection protection (Prisma)
- Transactional safety for all financial operations
- Redis caching for frequently accessed data
- Global exception handling

## Tech Stack

- **Framework:** NestJS 11
- **Language:** TypeScript 5.7
- **Database:** PostgreSQL 16
- **ORM:** Prisma 6
- **Cache:** Redis 7
- **Authentication:** Passport JWT
- **Validation:** class-validator
- **Testing:** Jest

## Prerequisites

- Node.js >= 18.x
- pnpm >= 8.x
- Docker & Docker Compose (for PostgreSQL & Redis)
- Git

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd payment-flow/backend
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start infrastructure services

```bash
# From the root directory (payment-flow/)
cd ..
docker compose up -d
```

This will start:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- pgAdmin on `http://localhost:5050`

### 4. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and update the values if needed.

## Configuration

Key environment variables in `.env`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/payment_flow?schema=public"

# JWT Secrets (change in production!)
JWT_ACCESS_SECRET=dev-super-secret-jwt-access-key-2025-payment-flow
JWT_REFRESH_SECRET=dev-super-secret-jwt-refresh-key-2025-payment-flow

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Application
PORT=3000
API_PREFIX=api/v1

# Wallet Limits
MINIMUM_WITHDRAWAL=1.00
MAXIMUM_DEPOSIT=10000.00
```

## Database Setup

### Generate Prisma Client

```bash
pnpm prisma:generate
```

### Run Migrations

```bash
# Development
pnpm prisma:migrate

# Production
pnpm prisma:migrate:prod
```

### View Database (Optional)

```bash
pnpm prisma:studio
```

Opens Prisma Studio at `http://localhost:5555`

## Running the Application

### Development Mode

```bash
pnpm start:dev
```

The API will be available at `http://localhost:3000/api/v1`

### Production Mode

```bash
pnpm build
pnpm start:prod
```

### Debug Mode

```bash
pnpm start:debug
```

## API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication Endpoints

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123",
  "role": "USER",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Roles:** `USER` or `MERCHANT`

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "USER",
    "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "accessToken": "jwt-token",
  "refreshToken": "jwt-refresh-token"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

#### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "jwt-refresh-token"
}
```

### Wallet Endpoints (Authenticated)

All wallet endpoints require `Authorization: Bearer <access-token>` header.

#### Get Wallet Balance
```http
GET /wallet
```

#### Deposit Funds
```http
POST /wallet/deposit
Content-Type: application/json

{
  "amount": 100.50,
  "description": "Adding funds"
}
```

#### Withdraw Funds
```http
POST /wallet/withdraw
Content-Type: application/json

{
  "amount": 50.00,
  "description": "Withdrawal"
}
```

#### Get Transaction History
```http
GET /wallet/transactions?page=1&limit=20
```

### Product Endpoints

#### Create Product (Merchant Only)
```http
POST /products
Authorization: Bearer <merchant-token>
Content-Type: application/json

{
  "name": "Gift Card $50",
  "description": "Amazon gift card",
  "price": 50.00,
  "availableUnits": 100
}
```

#### Get All Products (Public)
```http
GET /products
```

#### Get Product Details (Public)
```http
GET /products/:id
```

#### Update Product (Owner Only)
```http
PATCH /products/:id
Authorization: Bearer <merchant-token>
Content-Type: application/json

{
  "price": 45.00,
  "availableUnits": 150
}
```

#### Delete Product (Owner Only)
```http
DELETE /products/:id
Authorization: Bearer <merchant-token>
```

#### Get My Products (Merchant Only)
```http
GET /products/merchant/my-products
Authorization: Bearer <merchant-token>
```

### Order Endpoints (Authenticated)

#### Create Order (Purchase)
```http
POST /orders
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "productId": "product-uuid",
  "paymentMethod": "WALLET"
}
```

**Payment Methods:**
- `WALLET` - Pay with wallet balance (implemented)
- `GATEWAY` - Pay with Stripe (TODO)

#### Get My Orders
```http
GET /orders?page=1&limit=20
Authorization: Bearer <access-token>
```

#### Get My Sales (Merchant Only)
```http
GET /orders/merchant/sales?page=1&limit=20
Authorization: Bearer <merchant-token>
```

#### Get Order Details
```http
GET /orders/:id
Authorization: Bearer <access-token>
```

## Architecture

### Project Structure

```
src/
├── auth/                   # Authentication module
│   ├── strategies/         # JWT strategy
│   ├── dto/                # Login, Register DTOs
│   └── auth.service.ts     # Auth logic
│
├── wallets/                # Wallet management
│   ├── dto/                # Deposit, Withdraw DTOs
│   └── wallets.service.ts  # Transactional wallet ops
│
├── products/               # Product management
│   ├── dto/                # Create, Update DTOs
│   └── products.service.ts # CRUD + caching
│
├── orders/                 # Order processing
│   ├── dto/                # CreateOrder DTO
│   └── orders.service.ts   # Purchase flow + locking
│
├── database/               # Prisma setup
│   ├── prisma.service.ts   # Prisma client
│   └── database.module.ts  # Global module
│
├── common/                 # Shared utilities
│   ├── decorators/         # @CurrentUser, @Roles, @Public
│   ├── guards/             # JwtAuthGuard, RolesGuard
│   ├── filters/            # Exception filters
│   └── exceptions/         # Business exceptions
│
└── config/                 # Configuration
    ├── app.config.ts
    ├── jwt.config.ts
    ├── redis.config.ts
    └── stripe.config.ts
```

### Database Schema

See [prisma/schema.prisma](./prisma/schema.prisma) for complete schema.

**Key Models:**
- `User` - Authentication + roles (USER/MERCHANT)
- `Wallet` - User balance (Decimal precision)
- `WalletTransaction` - Complete audit trail
- `Product` - Digital products with stock
- `Order` - Purchase records

### Critical Design Decisions

1. **Transactional Safety:** All financial operations use Prisma transactions with `SERIALIZABLE` isolation level
2. **Stock Locking:** Uses `SELECT ... FOR UPDATE` (raw SQL) to prevent race conditions during purchases
3. **Audit Trail:** Immutable `WalletTransaction` records with before/after balance
4. **Caching:** Product listings cached in Redis (60s TTL), invalidated on mutations
5. **Security:** Passwords hashed with bcrypt (cost 12), JWT tokens, input validation with class-validator

## Security

### Best Practices Implemented

✅ **Authentication & Authorization**
- JWT tokens with short expiration (15min access, 7 days refresh)
- Role-based access control
- Password hashing with bcrypt (cost factor: 12)

✅ **Input Validation**
- Global validation pipe with `class-validator`
- Whitelist unknown properties
- Type transformation

✅ **Database Security**
- Prisma prevents SQL injection
- Transactional integrity
- Soft deletes for audit

✅ **Error Handling**
- Global exception filters
- No sensitive data in error messages
- Proper HTTP status codes

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker compose ps

# Restart PostgreSQL
docker compose restart postgres

# View logs
docker compose logs postgres
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker compose ps

# Test Redis connection
docker compose exec redis redis-cli ping
# Should return: PONG
```

### Prisma Client Not Found

```bash
# Regenerate Prisma Client
pnpm prisma:generate
```

## License

UNLICENSED - For assessment purposes only

---

**Built with ❤️ using NestJS, Prisma, and PostgreSQL**
