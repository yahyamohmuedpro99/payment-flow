import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { TransactionType, TransactionStatus, Prisma } from '@prisma/client';
import {
  InsufficientFundsException,
  WalletLockedException,
  InvalidDepositAmountException,
  InvalidWithdrawalAmountException,
} from '../common/exceptions/business.exceptions';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';

/**
 * Wallets Service
 * Handles all wallet operations with transactional safety
 * - All balance changes are atomic
 * - Complete audit trail via WalletTransaction
 * - Balance validation before operations
 */
@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);
  private readonly maxDeposit: number;
  private readonly minWithdrawal: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.maxDeposit = this.configService.get<number>('app.maximumDeposit') || 10000;
    this.minWithdrawal = this.configService.get<number>('app.minimumWithdrawal') || 1;
  }

  /**
   * Get user's wallet with current balance
   */
  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: {
        id: true,
        balance: true,
        currency: true,
        isLocked: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  /**
   * Deposit funds into wallet
   * - Validates deposit amount
   * - Creates transaction record
   * - Updates balance atomically
   */
  async deposit(userId: string, depositDto: DepositDto) {
    this.logger.log(`Deposit request: User ${userId}, Amount: $${depositDto.amount}`);

    // Validate amount
    if (depositDto.amount > this.maxDeposit) {
      throw new InvalidDepositAmountException(this.maxDeposit);
    }

    // Execute in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Get wallet with lock
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.isLocked) {
        throw new WalletLockedException();
      }

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + depositDto.amount;

      // Update wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: { balance: balanceAfter },
      });

      // Create transaction record
      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.COMPLETED,
          amount: depositDto.amount,
          balanceBefore,
          balanceAfter,
          currency: 'USD',
          description: depositDto.description || 'Wallet deposit',
        },
      });

      this.logger.log(
        `Deposit completed: User ${userId}, Transaction ${transaction.id}, New Balance: $${balanceAfter}`,
      );

      return {
        wallet: updatedWallet,
        transaction,
      };
    });

    return result;
  }

  /**
   * Withdraw funds from wallet
   * - Validates withdrawal amount
   * - Checks sufficient balance
   * - Creates transaction record
   * - Updates balance atomically
   */
  async withdraw(userId: string, withdrawDto: WithdrawDto) {
    this.logger.log(`Withdrawal request: User ${userId}, Amount: $${withdrawDto.amount}`);

    // Validate amount
    if (withdrawDto.amount < this.minWithdrawal) {
      throw new InvalidWithdrawalAmountException(this.minWithdrawal, this.maxDeposit);
    }

    // Execute in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Get wallet with lock
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.isLocked) {
        throw new WalletLockedException();
      }

      const balanceBefore = Number(wallet.balance);

      // Check sufficient funds
      if (balanceBefore < withdrawDto.amount) {
        throw new InsufficientFundsException(withdrawDto.amount, balanceBefore);
      }

      const balanceAfter = balanceBefore - withdrawDto.amount;

      // Update wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: { balance: balanceAfter },
      });

      // Create transaction record
      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.COMPLETED,
          amount: withdrawDto.amount,
          balanceBefore,
          balanceAfter,
          currency: 'USD',
          description: withdrawDto.description || 'Wallet withdrawal',
        },
      });

      this.logger.log(
        `Withdrawal completed: User ${userId}, Transaction ${transaction.id}, New Balance: $${balanceAfter}`,
      );

      return {
        wallet: updatedWallet,
        transaction,
      };
    });

    return result;
  }

  /**
   * Get wallet transaction history
   * Supports pagination
   */
  async getTransactions(userId: string, page: number = 1, limit: number = 20) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.walletTransaction.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Internal method: Deduct from wallet (used by orders)
   * MUST be called within a transaction
   */
  async deductFromWallet(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    referenceType: string,
    referenceId: string,
    description: string,
  ) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.isLocked) {
      throw new WalletLockedException();
    }

    const balanceBefore = Number(wallet.balance);

    if (balanceBefore < amount) {
      throw new InsufficientFundsException(amount, balanceBefore);
    }

    const balanceAfter = balanceBefore - amount;

    await tx.wallet.update({
      where: { userId },
      data: { balance: balanceAfter },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: TransactionType.PAYMENT,
        status: TransactionStatus.COMPLETED,
        amount,
        balanceBefore,
        balanceAfter,
        currency: 'USD',
        description,
        referenceType,
        referenceId,
      },
    });

    this.logger.log(`Wallet debited: User ${userId}, Amount: $${amount}, Ref: ${referenceId}`);
  }

  /**
   * Internal method: Credit to wallet (used for merchant earnings)
   * MUST be called within a transaction
   */
  async creditToWallet(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    referenceType: string,
    referenceId: string,
    description: string,
  ) {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = balanceBefore + amount;

    await tx.wallet.update({
      where: { userId },
      data: { balance: balanceAfter },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: TransactionType.EARNING,
        status: TransactionStatus.COMPLETED,
        amount,
        balanceBefore,
        balanceAfter,
        currency: 'USD',
        description,
        referenceType,
        referenceId,
      },
    });

    this.logger.log(`Wallet credited: User ${userId}, Amount: $${amount}, Ref: ${referenceId}`);
  }
}
