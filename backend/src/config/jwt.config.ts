import { registerAs } from '@nestjs/config';

export const jwtConfig = registerAs('jwt', () => ({
  accessSecret:
    process.env.JWT_ACCESS_SECRET ||
    'dev-super-secret-jwt-access-key-change-in-production',
  refreshSecret:
    process.env.JWT_REFRESH_SECRET ||
    'dev-super-secret-jwt-refresh-key-change-in-production',
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
}));
