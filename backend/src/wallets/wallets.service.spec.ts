import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WalletsService } from './wallets.service';
import { PrismaService } from '../database/prisma.service';
import { InsufficientFundsException } from '../common/exceptions/business.exceptions';

describe('WalletsService', () => {
  let service: WalletsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    wallet: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'app.minimumWithdrawal': 1.0,
        'app.maximumDeposit': 10000.0,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getWallet', () => {
    it('should return wallet for valid user', async () => {
      const userId = 'user-123';
      const mockWallet = {
        id: 'wallet-123',
        userId,
        balance: 100.50,
        currency: 'USD',
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.wallet.findUnique.mockResolvedValue(mockWallet);

      const result = await service.getWallet(userId);

      expect(result).toEqual(mockWallet);
      expect(mockPrismaService.wallet.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
    });

    it('should throw NotFoundException if wallet does not exist', async () => {
      const userId = 'nonexistent-user';

      mockPrismaService.wallet.findUnique.mockResolvedValue(null);

      await expect(service.getWallet(userId)).rejects.toThrow();
    });
  });

  describe('deposit', () => {
    it('should successfully deposit funds', async () => {
      const userId = 'user-123';
      const depositDto = { amount: 100.0 };

      const mockWallet = {
        id: 'wallet-123',
        userId,
        balance: 50.0,
        currency: 'USD',
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          wallet: {
            findUnique: jest.fn().mockResolvedValue(mockWallet),
            update: jest.fn().mockResolvedValue({
              ...mockWallet,
              balance: 150.0,
            }),
          },
          walletTransaction: {
            create: jest.fn().mockResolvedValue({
              id: 'transaction-123',
              type: 'DEPOSIT',
              amount: 100.0,
              balanceBefore: 50.0,
              balanceAfter: 150.0,
            }),
          },
        });
      });

      const result = await service.deposit(userId, depositDto);

      expect(result).toHaveProperty('wallet');
      expect(result).toHaveProperty('transaction');
      expect(result.wallet.balance).toBe(150.0);
      expect(result.transaction.type).toBe('DEPOSIT');
    });

    it('should throw error if deposit exceeds maximum', async () => {
      const userId = 'user-123';
      const depositDto = { amount: 20000.0 }; // Exceeds max of 10000

      await expect(service.deposit(userId, depositDto)).rejects.toThrow();
    });

    it('should throw error if amount is negative', async () => {
      const userId = 'user-123';
      const depositDto = { amount: -100.0 };

      await expect(service.deposit(userId, depositDto)).rejects.toThrow();
    });
  });

  describe('withdraw', () => {
    it('should successfully withdraw funds', async () => {
      const userId = 'user-123';
      const withdrawDto = { amount: 30.0 };

      const mockWallet = {
        id: 'wallet-123',
        userId,
        balance: 100.0,
        currency: 'USD',
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          wallet: {
            findUnique: jest.fn().mockResolvedValue(mockWallet),
            update: jest.fn().mockResolvedValue({
              ...mockWallet,
              balance: 70.0,
            }),
          },
          walletTransaction: {
            create: jest.fn().mockResolvedValue({
              id: 'transaction-123',
              type: 'WITHDRAWAL',
              amount: 30.0,
              balanceBefore: 100.0,
              balanceAfter: 70.0,
            }),
          },
        });
      });

      const result = await service.withdraw(userId, withdrawDto);

      expect(result).toHaveProperty('wallet');
      expect(result).toHaveProperty('transaction');
      expect(result.wallet.balance).toBe(70.0);
      expect(result.transaction.type).toBe('WITHDRAWAL');
    });

    it('should throw InsufficientFundsException if balance is too low', async () => {
      const userId = 'user-123';
      const withdrawDto = { amount: 150.0 };

      const mockWallet = {
        id: 'wallet-123',
        userId,
        balance: 100.0,
        currency: 'USD',
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          wallet: {
            findUnique: jest.fn().mockResolvedValue(mockWallet),
          },
        });
      });

      await expect(service.withdraw(userId, withdrawDto)).rejects.toThrow(InsufficientFundsException);
    });

    it('should throw error if withdrawal is below minimum', async () => {
      const userId = 'user-123';
      const withdrawDto = { amount: 0.5 }; // Below min of 1.0

      await expect(service.withdraw(userId, withdrawDto)).rejects.toThrow();
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transaction history', async () => {
      const userId = 'user-123';
      const page = 1;
      const limit = 10;

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'DEPOSIT',
          amount: 100.0,
          balanceBefore: 0,
          balanceAfter: 100.0,
          createdAt: new Date(),
        },
        {
          id: 'tx-2',
          type: 'WITHDRAWAL',
          amount: 20.0,
          balanceBefore: 100.0,
          balanceAfter: 80.0,
          createdAt: new Date(),
        },
      ];

      const mockWallet = { id: 'wallet-123' };

      mockPrismaService.wallet.findUnique.mockResolvedValue(mockWallet);
      mockPrismaService.walletTransaction.findMany.mockResolvedValue(mockTransactions);
      mockPrismaService.walletTransaction.count.mockResolvedValue(2);

      const result = await service.getTransactions(userId, page, limit);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });
});
