# Payment Flow - System Architecture

## Overview
Production-grade fintech backend system built with NestJS and Prisma for handling digital product sales with wallet and payment gateway integration.

## Technology Stack

### Core Framework
- **NestJS** - Enterprise-grade Node.js framework
- **TypeScript** - Type-safe development
- **Prisma** - Modern ORM with type-safe database queries

### Database & Caching
- **PostgreSQL** - Primary database with ACID compliance
- **Redis** - Caching layer for performance optimization

### Authentication & Security
- **Passport JWT** - Token-based authentication
- **bcrypt** - Password hashing (cost factor: 12)
- **class-validator** - Input validation

### Payment Processing
- **Stripe** - Payment gateway integration (test mode)

### Logging & Monitoring
- **Winston** - Structured logging with file rotation
- **nest-winston** - NestJS Winston integration

### Documentation
- **Swagger/OpenAPI** - Automatic API documentation

## Database Schema (Prisma)

### User Model
```prisma
- id: UUID (primary key)
- email: String (unique)
- password: String (hashed)
- role: Enum (USER | MERCHANT)
- firstName, lastName: Optional
- isActive: Boolean
- lastLogin: DateTime
- timestamps: createdAt, updatedAt, deletedAt
```

### Wallet Model
```prisma
- id: UUID
- balance: Decimal(12,2)
- currency: String (default: USD)
- isLocked: Boolean
- userId: UUID (one-to-one with User)
- timestamps
```

### WalletTransaction Model (Immutable Audit Log)
```prisma
- id: UUID
- type: Enum (DEPOSIT | WITHDRAWAL | PAYMENT | EARNING | REFUND)
- status: Enum (PENDING | COMPLETED | FAILED | REVERSED)
- amount: Decimal(12,2)
- balanceBefore, balanceAfter: Decimal(12,2)
- currency: String
- description: Text
- referenceType, referenceId: For linking to orders/payments
- metadata: JSON
- walletId: UUID
- timestamps
```

### Product Model
```prisma
- id: UUID
- name, description: String
- price: Decimal(12,2)
- currency: String
- availableUnits: Int (managed with locking)
- initialUnits: Int
- isActive: Boolean
- merchantId: UUID
- timestamps
```

### Order Model
```prisma
- id: UUID
- paymentMethod: Enum (WALLET | GATEWAY)
- status: Enum (PENDING | PAYMENT_PROCESSING | COMPLETED | FAILED | CANCELLED | REFUNDED)
- amount: Decimal(12,2)
- currency: String
- stripeSessionId, stripePaymentIntentId: For gateway payments
- idempotencyKey: String (unique, prevents duplicates)
- userId, productId, merchantId: UUIDs
- completedAt, failedAt: DateTime
- failureReason: Text
- metadata: JSON
- timestamps
```

## Critical Design Decisions

### 1. Concurrency Control
- **Prisma Transactions**: All financial operations wrapped in database transactions
- **Pessimistic Locking**: `SELECT ... FOR UPDATE` for stock management
- **Optimistic Locking**: Version fields for conflict detection
- **Idempotency Keys**: Prevent duplicate order submissions

### 2. Financial Data Precision
- **Decimal Type**: All monetary values use Decimal(12,2)
- **Never use Float/Double**: Prevents rounding errors
- **Currency Field**: Explicit currency tracking (USD default)

### 3. Audit Trail
- **Immutable Transactions**: WalletTransaction records never updated
- **Before/After Balance**: Complete state tracking
- **Soft Deletes**: All models support deletedAt
- **Timestamps**: createdAt, updatedAt on all models

### 4. Security
- **Password Hashing**: bcrypt with cost factor 12
- **JWT Tokens**: Access (15min) + Refresh (7 days)
- **Role-Based Access**: Guards enforce user/merchant permissions
- **Input Validation**: class-validator on all DTOs
- **SQL Injection Protection**: Prisma's parameterized queries

### 5. Caching Strategy
**What to Cache:**
- Product listings (TTL: 60s)
- Wallet balance (cache-aside pattern)

**What NOT to Cache:**
- Active transactions
- Order processing states
- Authentication tokens

**Invalidation:**
- Product cache: On create/update/delete
- Wallet cache: On any balance change

## Module Structure

```
src/
├── auth/                   # JWT authentication
│   ├── guards/             # JwtGuard, RolesGuard
│   ├── decorators/         # @CurrentUser, @Roles
│   └── strategies/         # JWT strategy
│
├── users/                  # User management
│   ├── dto/                # CreateUserDto, LoginDto
│   └── users.service.ts    # User CRUD + password hashing
│
├── wallets/                # Wallet operations
│   ├── dto/                # DepositDto, WithdrawDto
│   └── wallets.service.ts  # Transactional wallet ops
│
├── products/               # Product management
│   ├── dto/                # CreateProductDto
│   └── products.service.ts # CRUD + caching
│
├── orders/                 # Order processing
│   ├── dto/                # CreateOrderDto
│   └── orders.service.ts   # Purchase flow + stock locking
│
├── payments/               # Stripe integration
│   ├── stripe.service.ts   # Session creation
│   └── webhooks.controller.ts # Payment confirmation
│
├── database/               # Prisma setup
│   ├── prisma.service.ts   # Prisma client
│   └── database.module.ts  # Global module
│
└── common/                 # Shared utilities
    ├── decorators/
    ├── guards/
    ├── interceptors/
    └── filters/
```

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token

### Wallet (Authenticated)
- `POST /wallet/deposit` - Add funds
- `POST /wallet/withdraw` - Withdraw funds
- `GET /wallet` - Get balance
- `GET /wallet/transactions` - Transaction history

### Products
- `POST /products` - Create product (merchant only)
- `GET /products` - List all products (public)
- `GET /products/:id` - Get product details
- `PATCH /products/:id` - Update product (owner only)
- `DELETE /products/:id` - Delete product (owner only)

### Orders
- `POST /orders` - Create order (purchase)
- `GET /orders` - List user's orders
- `GET /orders/:id` - Order details

### Payments
- `POST /webhooks/stripe` - Stripe webhook handler
- `GET /payments/success` - Payment success redirect
- `GET /payments/cancel` - Payment cancel redirect

## Purchase Flow

### Wallet Payment
1. User initiates purchase with `paymentMethod: WALLET`
2. Begin database transaction
3. Lock product row (`SELECT ... FOR UPDATE`)
4. Check stock availability
5. Check user wallet balance
6. Deduct from user wallet
7. Add to merchant wallet
8. Decrement product stock
9. Create order record
10. Create wallet transaction records
11. Commit transaction
12. Invalidate wallet caches

### Gateway Payment
1. User initiates purchase with `paymentMethod: GATEWAY`
2. Create Stripe checkout session
3. Store session ID in pending order
4. Return session URL to user
5. User completes payment on Stripe
6. Stripe sends webhook to `/webhooks/stripe`
7. Verify webhook signature
8. Begin transaction
9. Lock product row
10. Check stock
11. Update order status
12. Credit merchant wallet
13. Decrement stock
14. Commit transaction

## Error Handling

### Business Logic Errors
- `InsufficientFundsException`
- `ProductOutOfStockException`
- `UnauthorizedException`
- `ProductNotFoundException`

### HTTP Status Codes
- `200` - Success
- `201` - Resource created
- `400` - Bad request (validation)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `409` - Conflict (race condition)
- `500` - Internal server error

## Testing Strategy

### Unit Tests
- Service layer business logic
- Input validation
- Password hashing
- JWT token generation

### Integration Tests
- Wallet deposit/withdrawal with transactions
- Product CRUD with caching
- Order creation with stock locking

### E2E Tests
- Complete user journey: Register → Deposit → Purchase
- Merchant journey: Create product → Receive payment
- Gateway payment flow
- Concurrent purchase race conditions

### Test Coverage Goal
- **Minimum**: 80%
- **Critical paths**: 100% (wallet, orders, payments)

## Deployment

### Environment Variables
See `.env.example` for all required variables

### Docker Setup
```bash
docker compose up -d  # Start PostgreSQL + Redis + pgAdmin
```

### Database Migration
```bash
pnpm prisma:migrate      # Development
pnpm prisma:migrate:prod # Production
```

### Running the App
```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm start:dev
```

## Monitoring & Logging

### Log Levels
- `error` - Failures, exceptions
- `warn` - Potential issues
- `info` - Important events (orders, payments)
- `debug` - Detailed debugging (development only)

### What to Log
- All financial transactions
- Order lifecycle events
- Payment gateway interactions
- Authentication attempts
- Error stack traces

### Log Storage
- **Development**: Console + File (`logs/app.log`)
- **Production**: File rotation (14 days retention)

## Performance Optimizations

1. **Database Indexes**:
   - Composite indexes on frequently queried fields
   - Index on foreign keys
   - Index on order status + createdAt

2. **Connection Pooling**:
   - Prisma manages connection pool automatically

3. **Caching**:
   - Redis for product listings
   - Cache-aside pattern for wallets

4. **Query Optimization**:
   - Select only needed fields
   - Use Prisma's `include` carefully
   - Pagination for large result sets

## Security Considerations

1. **Never log sensitive data**:
   - Passwords
   - Payment tokens
   - Full credit card numbers

2. **Rate limiting** (TODO):
   - Protect login endpoint
   - Limit payment attempts

3. **Input sanitization**:
   - class-validator on all inputs
   - Prisma prevents SQL injection

4. **CORS**:
   - Whitelist frontend URL only

5. **Helmet**:
   - Security headers middleware

## Future Enhancements

1. **Multi-currency support**
2. **Refund flow**
3. **Partial payments**
4. **Subscription products**
5. **Analytics dashboard**
6. **Email notifications**
7. **2FA for withdrawals**
8. **Rate limiting**
9. **API versioning**
10. **GraphQL API**

---

**Last Updated**: 2025-10-25
**Author**: Backend Engineer Assessment
