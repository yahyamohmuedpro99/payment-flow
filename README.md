# Payment Flow Backend

A payment backend system with wallet management, product catalog, order processing, and payment gateway integration.

---

## What This Project Does

This is a backend API for handling digital product sales with two payment methods:
- **Wallet payments** - Users deposit funds and purchase products from their balance
- **Stripe payments** - Credit card payments via Stripe checkout

### Core Features

**Authentication**
- JWT-based authentication with access and refresh tokens
- Role-based access control (USER/MERCHANT)
- Password hashing with bcrypt

**Wallet System**
- Deposit and withdraw funds
- Complete transaction audit trail
- Atomic balance updates to prevent data inconsistency
- Transaction history with pagination

**Product Management**
- Merchants can create and manage products
- Stock management with race condition prevention
- Product caching with Redis
- Only product owners can modify their products

**Order Processing**
- Purchase products using wallet balance or Stripe
- Atomic transactions ensure stock and balance are always consistent
- Prevents overselling when multiple users buy simultaneously
- Order history for users and sales tracking for merchants

**Additional Features**
- Stripe payment gateway integration
- Global error handling
- Input validation
- Redis caching for performance
- Swagger API documentation

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLIENT (Frontend/Postman/curl)                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                │ HTTPS/REST API
                                │ JSON Requests/Responses
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         NESTJS APPLICATION                           │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │                    API Gateway Layer                             │ │
│ │  • CORS Middleware     • JWT Auth Guard    • Validation Pipe    │ │
│ │  • Exception Filters   • Logging           • Swagger Docs       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│ │ Auth Module  │  │Wallet Module │  │Product Module│              │
│ │              │  │              │  │              │              │
│ │ • Register   │  │ • Deposit    │  │ • CRUD Ops   │              │
│ │ • Login      │  │ • Withdraw   │  │ • Caching    │              │
│ │ • Refresh    │  │ • Balance    │  │ • Ownership  │              │
│ │ • JWT Tokens │  │ • Audit Log  │  │ • Stock Mgmt │              │
│ └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│ │Order Module  │  │Webhook Module│  │Common/Shared │              │
│ │              │  │              │  │              │              │
│ │ • Purchase   │  │ • Stripe     │  │ • Guards     │              │
│ │ • Wallet Pay │  │ • Verify Sig │  │ • Decorators │              │
│ │ • Gateway Pay│  │ • Complete   │  │ • Filters    │              │
│ │ • History    │  │   Order      │  │ • Exceptions │              │
│ └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────┬──────────────────┬──────────────────┬─────────────────────┘
          │                  │                  │
          │ Prisma ORM       │ Redis Client     │ Stripe SDK
          ▼                  ▼                  ▼
┌──────────────────┐  ┌─────────────┐  ┌──────────────────┐
│  PostgreSQL 16   │  │   Redis 7   │  │   Stripe API     │
│                  │  │             │  │                  │
│ • Users          │  │ • Products  │  │ • Checkout       │
│ • Wallets        │  │   Cache     │  │ • Webhooks       │
│ • Transactions   │  │ • TTL: 60s  │  │ • Payments       │
│ • Products       │  │             │  │                  │
│ • Orders         │  │             │  │                  │
└──────────────────┘  └─────────────┘  └──────────────────┘
```

### Database Schema Design

```
┌──────────────────────┐
│        User          │
├──────────────────────┤
│ id            PK     │
│ email         UNIQUE │
│ passwordHash         │
│ role          ENUM   │
│ firstName            │
│ lastName             │
│ createdAt            │
└─────────┬────────────┘
          │
          │ 1:1
          ▼
┌──────────────────────┐
│       Wallet         │
├──────────────────────┤
│ id            PK     │
│ userId        FK     │
│ balance    DECIMAL   │
│ updatedAt            │
└─────────┬────────────┘
          │
          │ 1:N
          ▼
┌──────────────────────────────┐
│   WalletTransaction          │
├──────────────────────────────┤
│ id               PK          │
│ walletId         FK          │
│ type             ENUM        │
│ amount           DECIMAL     │
│ balanceBefore    DECIMAL     │  ← Audit Trail
│ balanceAfter     DECIMAL     │  ← Audit Trail
│ referenceId                  │
│ description                  │
│ createdAt                    │
└──────────────────────────────┘

┌──────────────────────┐
│      Product         │
├──────────────────────┤
│ id            PK     │
│ merchantId    FK     │
│ name                 │
│ description          │
│ price      DECIMAL   │
│ availableUnits       │
│ isActive             │
│ createdAt            │
└─────────┬────────────┘
          │
          │ 1:N
          ▼
┌──────────────────────┐
│       Order          │
├──────────────────────┤
│ id            PK     │
│ userId        FK     │
│ productId     FK     │
│ merchantId    FK     │
│ amount     DECIMAL   │
│ status        ENUM   │
│ paymentMethod ENUM   │
│ stripeSessionId      │
│ createdAt            │
└──────────────────────┘
```

### Purchase Flow - Race Condition Prevention

```
User Request: POST /api/v1/orders
    │
    ├──► JWT Auth Guard
    │    └─► Verify token, extract user ID
    │
    ├──► Validation Pipe
    │    └─► Validate CreateOrderDto
    │
    ▼
OrdersService.createWalletOrder()
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  BEGIN TRANSACTION (SERIALIZABLE Isolation Level)       │
│                                                          │
│  Step 1: Lock Product Row                               │
│  ┌────────────────────────────────────────────┐        │
│  │ SELECT * FROM products                      │        │
│  │ WHERE id = $1                               │        │
│  │ FOR UPDATE  ◄─── CRITICAL: Pessimistic Lock │        │
│  └────────────────────────────────────────────┘        │
│  → Blocks other transactions from reading this row     │
│                                                          │
│  Step 2: Validate Stock                                 │
│  ├─► if (product.availableUnits < 1)                   │
│  │    throw OutOfStockException()                      │
│  └─► PASS: Stock available                             │
│                                                          │
│  Step 3: Lock Buyer Wallet                              │
│  ├─► SELECT wallet WHERE userId = $buyerId             │
│  └─► FOR UPDATE (lock wallet row)                      │
│                                                          │
│  Step 4: Validate Balance                               │
│  ├─► if (wallet.balance < product.price)               │
│  │    throw InsufficientFundsException()               │
│  └─► PASS: Balance sufficient                          │
│                                                          │
│  Step 5: Deduct from Buyer                              │
│  ├─► UPDATE wallets                                     │
│  │    SET balance = balance - price                    │
│  │    WHERE userId = $buyerId                          │
│  └─► INSERT INTO wallet_transactions (PAYMENT)         │
│       • balanceBefore: original                        │
│       • balanceAfter: new balance                      │
│                                                          │
│  Step 6: Credit Merchant                                │
│  ├─► UPDATE wallets                                     │
│  │    SET balance = balance + price                    │
│  │    WHERE userId = $merchantId                       │
│  └─► INSERT INTO wallet_transactions (REVENUE)         │
│                                                          │
│  Step 7: Decrement Stock                                │
│  └─► UPDATE products                                    │
│       SET availableUnits = availableUnits - 1          │
│       WHERE id = $productId                            │
│       → SAFE: Row is locked, no race condition         │
│                                                          │
│  Step 8: Create Order Record                            │
│  └─► INSERT INTO orders (status = COMPLETED)           │
│                                                          │
│  COMMIT TRANSACTION                                      │
│  → Release all locks                                     │
│  → All changes become permanent atomically              │
└─────────────────────────────────────────────────────────┘
    │
    ├─► SUCCESS: Return order details
    │
    └─► FAILURE: ROLLBACK all changes
```

**Why This Prevents Race Conditions:**

1. **FOR UPDATE Lock**: Prevents concurrent transactions from reading the product row
2. **SERIALIZABLE Isolation**: Strongest isolation level, prevents phantom reads
3. **Atomic Operations**: All steps succeed together or all fail together
4. **Stock Check + Decrement**: Happen in same transaction with row locked

---

## 🛠️ Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | NestJS | 11 | Enterprise Node.js framework with DI |
| **Language** | TypeScript | 5.9 | Type-safe development |
| **Database** | PostgreSQL | 16 | ACID-compliant relational database |
| **ORM** | Prisma | 6 | Type-safe database client |
| **Cache** | Redis | 7 | In-memory caching layer |
| **Auth** | Passport JWT | Latest | Token-based authentication |
| **Payment** | Stripe | Latest | Payment gateway integration |
| **Validation** | class-validator | Latest | DTO validation |
| **Testing** | Jest + Supertest | Latest | Unit & E2E testing |
| **Container** | Docker Compose | Latest | Multi-container orchestration |
| **API Docs** | Swagger/OpenAPI | Latest | Interactive API documentation |

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.x
- pnpm >= 8.x
- Docker & Docker Compose
- Git

### Installation

```bash
# 1. Clone repository
git clone <repository-url>
cd payment-flow

# 2. Start infrastructure (PostgreSQL, Redis, pgAdmin)
docker compose up -d

# 3. Install dependencies
cd backend
pnpm install

# 4. Setup environment
cp .env.example .env

# 5. Setup database
pnpm prisma:generate
pnpm prisma:migrate

# 6. Start development server
pnpm start:dev
```

**Access Points:**
- API: http://localhost:3000/api/v1
- Swagger Docs: http://localhost:3000/api/docs
- pgAdmin: http://localhost:5050

---

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Endpoints Overview

| Module | Endpoint | Method | Auth | Description |
|--------|----------|--------|------|-------------|
| **Authentication** |
| | `/auth/register` | POST | Public | Create new account (USER/MERCHANT) |
| | `/auth/login` | POST | Public | Login with credentials |
| | `/auth/refresh` | POST | Public | Refresh access token |
| **Wallet** |
| | `/wallet` | GET | Required | Get wallet balance |
| | `/wallet/deposit` | POST | Required | Deposit funds |
| | `/wallet/withdraw` | POST | Required | Withdraw funds |
| | `/wallet/transactions` | GET | Required | Transaction history |
| **Products** |
| | `/products` | GET | Public | List all products (cached) |
| | `/products` | POST | Merchant | Create product |
| | `/products/:id` | GET | Public | Get product details |
| | `/products/:id` | PATCH | Owner | Update product |
| | `/products/:id` | DELETE | Owner | Delete product |
| | `/products/merchant/my-products` | GET | Merchant | My products |
| **Orders** |
| | `/orders` | POST | Required | Purchase product |
| | `/orders` | GET | Required | My orders |
| | `/orders/:id` | GET | Required | Order details |
| | `/orders/merchant/sales` | GET | Merchant | My sales |
| **Webhooks** |
| | `/webhooks/stripe` | POST | Signature | Stripe payment webhook |

### Example: Complete Purchase Flow

```bash
# 1. Register user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "buyer@example.com",
    "password": "SecurePass123!",
    "role": "USER"
  }'

# Response: { accessToken, refreshToken, user }

# 2. Deposit funds to wallet
curl -X POST http://localhost:3000/api/v1/wallet/deposit \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500.00,
    "description": "Initial deposit"
  }'

# 3. List available products
curl http://localhost:3000/api/v1/products

# 4. Purchase product
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<PRODUCT_ID>",
    "paymentMethod": "WALLET"
  }'

# 5. Check order history
curl http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

**Full API Guide:** See [COMPLETE_TEST_GUIDE.md](COMPLETE_TEST_GUIDE.md)

---

## 🧪 Testing

### Automated Test Suite

```bash
cd backend

# Run all tests
pnpm test

# E2E tests
pnpm test:e2e

# Coverage report
pnpm test:cov

# Automated endpoint testing (40+ API calls)
chmod +x test-all-endpoints.sh
./test-all-endpoints.sh
```

### Test Coverage

✅ **Unit Tests**
- AuthService (registration, login, JWT generation)
- WalletsService (deposits, withdrawals, audit trail)

✅ **E2E Tests**
- User registration & authentication
- Wallet operations (deposit, withdraw, balance)
- Product CRUD operations
- Purchase flow (wallet payment)
- Merchant sales tracking
- Role-based access control

---

## 🔐 Security Features

### Authentication & Authorization
- ✅ JWT tokens (15min access, 7 days refresh)
- ✅ bcrypt password hashing (cost factor: 12)
- ✅ Role-based access control (USER/MERCHANT)
- ✅ Global JWT guard with public route exceptions

### Input Validation
- ✅ Global validation pipe with class-validator
- ✅ Whitelist unknown properties
- ✅ Type transformation

### Database Security
- ✅ Prisma ORM prevents SQL injection
- ✅ Transactional integrity (ACID)
- ✅ Decimal precision for financial data

### Error Handling
- ✅ Global exception filters
- ✅ No sensitive data in error responses
- ✅ Proper HTTP status codes

---

## 📁 Project Structure

```
payment-flow/
├── backend/                    # NestJS application
│   ├── src/
│   │   ├── auth/              # Authentication module
│   │   ├── wallets/           # Wallet management
│   │   ├── products/          # Product management
│   │   ├── orders/            # Order processing
│   │   ├── webhooks/          # Stripe webhooks
│   │   ├── common/            # Shared utilities
│   │   ├── config/            # Configuration
│   │   ├── database/          # Prisma setup
│   │   └── main.ts            # Bootstrap
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   ├── test/                  # E2E tests
│   └── README.md              # Backend documentation
├── docker-compose.yml         # Infrastructure setup
├── ARCHITECTURE.md            # Detailed architecture
├── COMPLETE_TEST_GUIDE.md     # Testing guide
└── README.md                  # This file
```

---

## Implementation Details

### Authentication & Authorization
- Uses Passport JWT strategy for token validation
- Passwords hashed with bcrypt
- Global JWT guard applied to all routes by default
- Public routes marked with `@Public()` decorator
- Role-based guards for USER/MERCHANT access control

### Wallet System
- All wallet operations use database transactions with SERIALIZABLE isolation level
- Each transaction creates an immutable log entry with before/after balance
- Prevents data inconsistency even under concurrent operations

### Product Management
- Standard CRUD operations for products
- Product list cached in Redis with 60s TTL
- Cache automatically invalidated when products are created/updated/deleted
- Ownership validation ensures only the merchant who created a product can modify it

### Purchase Flow
- Uses pessimistic locking (`SELECT FOR UPDATE`) to prevent race conditions
- Transaction locks the product row before checking stock
- All operations (balance check, stock decrement, order creation) happen atomically
- If any step fails, entire transaction is rolled back

### Payment Gateway
- Stripe checkout sessions for credit card payments
- Webhook endpoint receives payment confirmation from Stripe
- Verifies webhook signature for security
- Completes pending orders when payment succeeds

### Testing
- Unit tests for core services (Auth, Wallets)
- E2E tests for complete user flows
- Automated test script that calls all API endpoints

---

## Troubleshooting

### Database Connection Issues
```bash
docker compose ps                 # Check service status
docker compose restart postgres   # Restart database
docker compose logs postgres      # View logs
```

### Redis Connection Issues
```bash
docker compose exec redis redis-cli ping  # Should return PONG
docker compose restart redis              # Restart cache
```

### Prisma Client Not Found
```bash
pnpm prisma:generate
```

---

## Additional Documentation

- **[Backend README](backend/README.md)** - Detailed backend documentation
- **[Architecture Guide](ARCHITECTURE.md)** - System architecture details
- **[Test Guide](COMPLETE_TEST_GUIDE.md)** - API testing guide
- **[API Docs](http://localhost:3000/api/docs)** - Interactive Swagger documentation

---

## License

UNLICENSED - For assessment purposes only
