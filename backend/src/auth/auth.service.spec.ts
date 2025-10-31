import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    wallet: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        'jwt.accessSecret': 'test-access-secret',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.accessExpiration': '15m',
        'jwt.refreshExpiration': '7d',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'Test123!',
        role: 'USER' as const,
      };

      const hashedPassword = await bcrypt.hash(registerDto.password, 12);
      const mockUser = {
        id: 'user-123',
        email: registerDto.email,
        password: hashedPassword,
        role: registerDto.role,
        firstName: null,
        lastName: null,
        createdAt: new Date(),
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          user: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(mockUser),
          },
          wallet: {
            create: jest.fn().mockResolvedValue({ id: 'wallet-123' }),
          },
        });
      });

      mockJwtService.signAsync.mockResolvedValueOnce('access-token');
      mockJwtService.signAsync.mockResolvedValueOnce('refresh-token');

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(registerDto.email);
    });

    it('should throw error if email already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'Test123!',
        role: 'USER' as const,
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          user: {
            findUnique: jest.fn().mockResolvedValue({ id: 'existing-user' }),
            create: jest.fn(),
          },
        });
      });

      await expect(service.register(registerDto)).rejects.toThrow();
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Test123!',
      };

      const hashedPassword = await bcrypt.hash(loginDto.password, 12);
      const mockUser = {
        id: 'user-123',
        email: loginDto.email,
        password: hashedPassword,
        role: 'USER',
        isActive: true,
        firstName: null,
        lastName: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValueOnce('access-token');
      mockJwtService.signAsync.mockResolvedValueOnce('refresh-token');

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'Test123!',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'WrongPassword!',
      };

      const hashedPassword = await bcrypt.hash('CorrectPassword!', 12);
      const mockUser = {
        id: 'user-123',
        email: loginDto.email,
        password: hashedPassword,
        role: 'USER',
        isActive: true,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Test123!',
      };

      const hashedPassword = await bcrypt.hash(loginDto.password, 12);
      const mockUser = {
        id: 'user-123',
        email: loginDto.email,
        password: hashedPassword,
        role: 'USER',
        isActive: false,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should successfully refresh tokens with valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'USER',
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'USER',
        isActive: true,
      };

      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValueOnce('new-access-token');
      mockJwtService.signAsync.mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshTokens(refreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const refreshToken = 'invalid-refresh-token';

      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
