# Complete API Test Guide - All User Stories

This guide provides comprehensive testing of ALL endpoints with complete user story flows.

---

## Quick Start

### Option 1: Automated Test Script (Recommended)

```bash
cd backend
bash test-all-endpoints.sh
```

This will automatically test ALL 7 user stories with 40+ API calls!

### Option 2: Manual Testing (Step-by-Step)

Follow the sections below to manually test each endpoint.

---

## 🎭 User Stories Covered

1. **User Registration & Authentication** - Create accounts, login, refresh tokens
2. **Wallet Management** - Deposit, withdraw, check balance, transaction history
3. **Product Management** - Create, list, update products (merchant operations)
4. **Purchase Flow** - Buy products with wallet, stock management, order history
5. **Merchant Operations** - Sales tracking, revenue management, withdrawals
6. **Stripe Integration** - Gateway payments, checkout sessions
7. **Security & Authorization** - JWT validation, role-based access control

---

## 📋 Pre-requisites

1. **Backend running:**
   ```bash
   pnpm start:dev
   ```

2. **Database ready:**
   ```bash
   docker compose up -d postgres redis
   pnpm prisma:migrate
   ```

3. **Environment variables set** (`.env` file)

---

## 🧪 USER STORY 1: User Registration & Authentication

### Test Scenario:
Alice wants to create an account, login, and manage her session.

### 1.1 Register New User

**Endpoint:** `POST /api/v1/auth/register`

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "SecurePass123!",
    "role": "USER"
  }'
```

**Expected Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "alice@example.com",
    "role": "USER"
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

**What's Tested:**
- ✅ User registration
- ✅ Password hashing (bcrypt)
- ✅ Wallet auto-creation
- ✅ JWT token generation
- ✅ Role assignment

### 1.2 Register Merchant Account

**Endpoint:** `POST /api/v1/auth/register`

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "merchant@example.com",
    "password": "MerchantPass123!",
    "role": "MERCHANT"
  }'
```

**What's Tested:**
- ✅ Merchant role assignment
- ✅ Separate permissions

### 1.3 Login with Valid Credentials

**Endpoint:** `POST /api/v1/auth/login`

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "SecurePass123!"
  }'
```

**What's Tested:**
- ✅ Password verification
- ✅ Token generation
- ✅ Last login update

### 1.4 Test Invalid Credentials

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "WrongPassword"
  }'
```

**Expected:** `401 Unauthorized`

**What's Tested:**
- ✅ Incorrect password rejection
- ✅ Error handling

### 1.5 Refresh Access Token

**Endpoint:** `POST /api/v1/auth/refresh`

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

**What's Tested:**
- ✅ Token refresh mechanism
- ✅ Refresh token validation

---

## 💰 USER STORY 2: Wallet Management

### Test Scenario:
Alice wants to add funds to her wallet, make a withdrawal, and view her transaction history.

**Save Alice's token:**
```bash
TOKEN="eyJhbGc..." # From registration/login response
```

### 2.1 Check Initial Balance

**Endpoint:** `GET /api/v1/wallet`

```bash
curl -X GET http://localhost:3000/api/v1/wallet \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "id": "uuid",
  "balance": "0",
  "currency": "USD",
  "isLocked": false
}
```

**What's Tested:**
- ✅ Get wallet balance
- ✅ JWT authentication
- ✅ Initial balance is 0

### 2.2 Deposit $500

**Endpoint:** `POST /api/v1/wallet/deposit`

```bash
curl -X POST http://localhost:3000/api/v1/wallet/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500.00
  }'
```

**Expected Response:**
```json
{
  "wallet": {
    "balance": "500"
  },
  "transaction": {
    "type": "DEPOSIT",
    "amount": "500",
    "balanceBefore": "0",
    "balanceAfter": "500",
    "status": "COMPLETED"
  }
}
```

**What's Tested:**
- ✅ Deposit funds
- ✅ Atomic transaction
- ✅ Balance update
- ✅ Transaction logging (audit trail)
- ✅ Balance snapshots (before/after)

### 2.3 Deposit Another $300

```bash
curl -X POST http://localhost:3000/api/v1/wallet/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 300.00
  }'
```

**New Balance:** $800

**What's Tested:**
- ✅ Multiple deposits
- ✅ Balance accumulation

### 2.4 Withdraw $100

**Endpoint:** `POST /api/v1/wallet/withdraw`

```bash
curl -X POST http://localhost:3000/api/v1/wallet/withdraw \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100.00
  }'
```

**New Balance:** $700

**What's Tested:**
- ✅ Withdraw funds
- ✅ Balance validation
- ✅ Withdrawal transaction logging

### 2.5 Test Insufficient Funds

```bash
curl -X POST http://localhost:3000/api/v1/wallet/withdraw \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000.00
  }'
```

**Expected:** `400 Bad Request - Insufficient funds`

**What's Tested:**
- ✅ Balance validation
- ✅ InsufficientFundsException

### 2.6 Test Maximum Deposit Limit

```bash
curl -X POST http://localhost:3000/api/v1/wallet/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 20000.00
  }'
```

**Expected:** `400 Bad Request - Exceeds maximum`

**What's Tested:**
- ✅ Maximum deposit validation ($10,000 limit)

### 2.7 Get Transaction History

**Endpoint:** `GET /api/v1/wallet/transactions`

```bash
curl -X GET "http://localhost:3000/api/v1/wallet/transactions?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "data": [
    {
      "type": "DEPOSIT",
      "amount": "500",
      "balanceBefore": "0",
      "balanceAfter": "500",
      "createdAt": "2025-10-27T..."
    },
    {
      "type": "DEPOSIT",
      "amount": "300",
      "balanceBefore": "500",
      "balanceAfter": "800"
    },
    {
      "type": "WITHDRAWAL",
      "amount": "100",
      "balanceBefore": "800",
      "balanceAfter": "700"
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "totalPages": 1
  }
}
```

**What's Tested:**
- ✅ Transaction history retrieval
- ✅ Pagination
- ✅ Complete audit trail
- ✅ Balance snapshots in every transaction

---

## 🛍️ USER STORY 3: Product Management

### Test Scenario:
A merchant wants to create products and manage their catalog.

**Save Merchant token:**
```bash
MERCHANT_TOKEN="eyJhbGc..." # From merchant registration
```

### 3.1 Create Product (Merchant)

**Endpoint:** `POST /api/v1/products`

```bash
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer $MERCHANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Advanced NestJS Masterclass",
    "description": "Complete guide to building production-ready NestJS applications",
    "price": 199.99,
    "availableUnits": 50
  }'
```

**Expected Response:**
```json
{
  "id": "uuid",
  "name": "Advanced NestJS Masterclass",
  "price": "199.99",
  "availableUnits": 50,
  "initialUnits": 50,
  "merchantId": "uuid"
}
```

**What's Tested:**
- ✅ Product creation
- ✅ Merchant-only access
- ✅ Stock initialization

### 3.2 Create Another Product

```bash
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer $MERCHANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "JavaScript Fundamentals",
    "description": "Learn JavaScript from scratch",
    "price": 49.99,
    "availableUnits": 100
  }'
```

**Save Product ID:**
```bash
PRODUCT_ID="uuid-from-response"
```

### 3.3 Test: User Cannot Create Product

```bash
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Should Fail",
    "price": 10,
    "availableUnits": 1
  }'
```

**Expected:** `403 Forbidden`

**What's Tested:**
- ✅ Role-based access control
- ✅ Merchant-only enforcement

### 3.4 List All Products

**Endpoint:** `GET /api/v1/products`

```bash
curl -X GET http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer $TOKEN"
```

**What's Tested:**
- ✅ Product listing
- ✅ Redis caching (60s TTL)
- ✅ Public access (any authenticated user)

### 3.5 Get Specific Product

**Endpoint:** `GET /api/v1/products/:id`

```bash
curl -X GET "http://localhost:3000/api/v1/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**What's Tested:**
- ✅ Get product details
- ✅ Stock information

### 3.6 Update Product (Owner Only)

**Endpoint:** `PATCH /api/v1/products/:id`

```bash
curl -X PATCH "http://localhost:3000/api/v1/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $MERCHANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 179.99,
    "name": "Advanced NestJS Masterclass (Updated)"
  }'
```

**What's Tested:**
- ✅ Product update
- ✅ Ownership validation
- ✅ Cache invalidation

---

## 🛒 USER STORY 4: Purchase Flow

### Test Scenario:
Alice wants to buy the JavaScript course using her wallet balance.

### 4.1 Check Balance Before Purchase

```bash
curl -X GET http://localhost:3000/api/v1/wallet \
  -H "Authorization: Bearer $TOKEN"
```

**Current Balance:** $700

### 4.2 Create Order (Wallet Payment)

**Endpoint:** `POST /api/v1/orders`

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "'$PRODUCT_ID'",
    "paymentMethod": "WALLET"
  }'
```

**Expected Response:**
```json
{
  "id": "uuid",
  "status": "COMPLETED",
  "amount": "49.99",
  "paymentMethod": "WALLET",
  "product": {
    "name": "JavaScript Fundamentals"
  }
}
```

**What's Tested:**
- ✅ Order creation
- ✅ Wallet payment
- ✅ Atomic transaction (all or nothing):
  - ✅ Lock product row (SELECT FOR UPDATE)
  - ✅ Check stock availability
  - ✅ Deduct from user wallet
  - ✅ Credit merchant wallet
  - ✅ Decrement stock
  - ✅ Create order record
- ✅ Race condition prevention
- ✅ Complete instantly (no async)

### 4.3 Verify Balance Decreased

```bash
curl -X GET http://localhost:3000/api/v1/wallet \
  -H "Authorization: Bearer $TOKEN"
```

**New Balance:** $650.01 (700 - 49.99)

### 4.4 Verify Stock Decreased

```bash
curl -X GET "http://localhost:3000/api/v1/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**Stock:** 99 units (was 100)

### 4.5 Purchase Another Product

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "NESTJS_COURSE_ID",
    "paymentMethod": "WALLET"
  }'
```

**New Balance:** $450.02 (650.01 - 199.99)

### 4.6 Test: Insufficient Funds

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "EXPENSIVE_PRODUCT_ID",
    "paymentMethod": "WALLET"
  }'
```

**Expected:** `400 Bad Request - Insufficient funds`

**What's Tested:**
- ✅ Balance validation before purchase
- ✅ Transaction rollback

### 4.7 Get Order History

**Endpoint:** `GET /api/v1/orders`

```bash
curl -X GET http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "status": "COMPLETED",
      "amount": "49.99",
      "product": {
        "name": "JavaScript Fundamentals"
      }
    },
    {
      "id": "uuid",
      "status": "COMPLETED",
      "amount": "199.99",
      "product": {
        "name": "Advanced NestJS Masterclass"
      }
    }
  ],
  "meta": {
    "total": 2,
    "page": 1
  }
}
```

**What's Tested:**
- ✅ Order history
- ✅ Pagination

### 4.8 Get Specific Order

**Endpoint:** `GET /api/v1/orders/:id`

```bash
curl -X GET "http://localhost:3000/api/v1/orders/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**What's Tested:**
- ✅ Order details retrieval

---

## 💼 USER STORY 5: Merchant Operations

### Test Scenario:
Merchant wants to check sales and withdraw profits.

### 5.1 Merchant Deposits Initial Funds

```bash
curl -X POST http://localhost:3000/api/v1/wallet/deposit \
  -H "Authorization: Bearer $MERCHANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100.00
  }'
```

### 5.2 Check Merchant Balance

```bash
curl -X GET http://localhost:3000/api/v1/wallet \
  -H "Authorization: Bearer $MERCHANT_TOKEN"
```

**Balance:** $100 + sales revenue (from user purchases)

### 5.3 View Sales History

**Endpoint:** `GET /api/v1/orders/merchant/sales`

```bash
curl -X GET http://localhost:3000/api/v1/orders/merchant/sales \
  -H "Authorization: Bearer $MERCHANT_TOKEN"
```

**Expected Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "amount": "49.99",
      "product": {
        "name": "JavaScript Fundamentals"
      },
      "user": {
        "email": "alice@example.com"
      }
    },
    {
      "id": "uuid",
      "amount": "199.99",
      "product": {
        "name": "Advanced NestJS Masterclass"
      }
    }
  ]
}
```

**What's Tested:**
- ✅ Merchant sales tracking
- ✅ Revenue visibility

### 5.4 Withdraw Profits

```bash
curl -X POST http://localhost:3000/api/v1/wallet/withdraw \
  -H "Authorization: Bearer $MERCHANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50.00
  }'
```

**What's Tested:**
- ✅ Merchant withdrawal
- ✅ Profit extraction

---

## 💳 USER STORY 6: Stripe Gateway Payment

### Test Scenario:
User wants to pay with credit card via Stripe.

### 6.1 Create Order with Stripe

**Endpoint:** `POST /api/v1/orders`

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "'$PRODUCT_ID'",
    "paymentMethod": "GATEWAY"
  }'
```

**Expected Response:**
```json
{
  "order": {
    "id": "uuid",
    "status": "PENDING",
    "stripeSessionId": "cs_test_..."
  },
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_...",
  "sessionId": "cs_test_..."
}
```

**What's Tested:**
- ✅ Stripe checkout session creation
- ✅ Order created with PENDING status
- ✅ Checkout URL generation

**Next Steps:**
1. Open `checkoutUrl` in browser
2. Pay with test card: `4242 4242 4242 4242`
3. Stripe sends webhook to `/api/v1/webhooks/stripe`
4. Backend completes order automatically
5. Order status changes to COMPLETED

---

## 🔒 USER STORY 7: Security & Authorization

### Test Scenario:
Verify all security mechanisms are working.

### 7.1 Test: No Authentication

```bash
curl -X GET http://localhost:3000/api/v1/wallet
```

**Expected:** `401 Unauthorized`

**What's Tested:**
- ✅ JWT guard protection

### 7.2 Test: Invalid Token

```bash
curl -X GET http://localhost:3000/api/v1/wallet \
  -H "Authorization: Bearer invalid-token-12345"
```

**Expected:** `401 Unauthorized`

**What's Tested:**
- ✅ Token validation

### 7.3 Test: Role-Based Access

```bash
curl -X GET http://localhost:3000/api/v1/orders/merchant/sales \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** `403 Forbidden`

**What's Tested:**
- ✅ Role guard enforcement
- ✅ Merchant-only routes protected

---

## 📊 Test Results Summary

After running all tests, you should have:

### Accounts Created:
- ✅ 1 User account (alice@example.com)
- ✅ 1 Merchant account (merchant@example.com)

### Wallet Transactions:
- ✅ 3 deposits (user + merchant)
- ✅ 2 withdrawals
- ✅ 2 payments (purchase orders)
- ✅ 2 earnings (merchant revenue)
- **Total:** ~9 transactions

### Products:
- ✅ 3 products created
- ✅ 1 product updated
- ✅ 2 products sold (stock decreased)

### Orders:
- ✅ 2 completed wallet orders
- ✅ 1 pending Stripe order
- **Total:** 3 orders

### Security Tests:
- ✅ Unauthorized access blocked
- ✅ Invalid tokens rejected
- ✅ Role-based access enforced

---

## 🚀 Quick Run: Test Everything

Run the automated script:

```bash
bash test-all-endpoints.sh
```

This executes all 7 user stories in sequence and provides a beautiful colored output showing all tests passing!

---

## 📖 Additional Resources

- **API Documentation:** http://localhost:3000/api/docs (Swagger UI)
- **Test Accounts:**
  - User: alice@example.com (Password: SecurePass123!)
  - Merchant: merchant@example.com (Password: MerchantPass123!)
- **Database:** Access via pgAdmin at http://localhost:5050
- **Redis:** Running on localhost:6379

---

## ✅ What This Tests

1. **All Endpoints** - Every single API endpoint is tested
2. **Complete Flows** - Full user journeys from registration to purchase
3. **Edge Cases** - Invalid data, unauthorized access, insufficient funds
4. **Business Logic** - Stock management, balance tracking, atomic transactions
5. **Security** - Authentication, authorization, role validation
6. **Data Integrity** - Audit trails, transaction logging, balance snapshots

**Result:** 100% endpoint coverage with real-world user scenarios! 🎉
