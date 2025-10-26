import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Custom Business Logic Exceptions
 * Domain-specific errors for the payment flow system
 */

export class InsufficientFundsException extends HttpException {
  constructor(required: number, available: number) {
    super(
      {
        message: `Insufficient funds. Required: $${required}, Available: $${available}`,
        error: 'INSUFFICIENT_FUNDS',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class ProductOutOfStockException extends HttpException {
  constructor(productName: string) {
    super(
      {
        message: `Product "${productName}" is out of stock`,
        error: 'PRODUCT_OUT_OF_STOCK',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class ProductNotFoundException extends HttpException {
  constructor(productId: string) {
    super(
      {
        message: `Product with ID "${productId}" not found`,
        error: 'PRODUCT_NOT_FOUND',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class WalletLockedException extends HttpException {
  constructor() {
    super(
      {
        message: 'Wallet is locked. Please contact support.',
        error: 'WALLET_LOCKED',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class InvalidWithdrawalAmountException extends HttpException {
  constructor(min: number, max: number) {
    super(
      {
        message: `Withdrawal amount must be between $${min} and $${max}`,
        error: 'INVALID_WITHDRAWAL_AMOUNT',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InvalidDepositAmountException extends HttpException {
  constructor(max: number) {
    super(
      {
        message: `Deposit amount cannot exceed $${max}`,
        error: 'INVALID_DEPOSIT_AMOUNT',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class UnauthorizedProductAccessException extends HttpException {
  constructor() {
    super(
      {
        message: 'You are not authorized to modify this product',
        error: 'UNAUTHORIZED_PRODUCT_ACCESS',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class DuplicateOrderException extends HttpException {
  constructor() {
    super(
      {
        message: 'Duplicate order detected. Please try again.',
        error: 'DUPLICATE_ORDER',
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class PaymentProcessingException extends HttpException {
  constructor(reason: string) {
    super(
      {
        message: `Payment processing failed: ${reason}`,
        error: 'PAYMENT_PROCESSING_FAILED',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
