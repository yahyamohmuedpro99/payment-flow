import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',

  // Wallet configuration
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
  minimumWithdrawal: parseFloat(process.env.MINIMUM_WITHDRAWAL ?? '1.0'),
  maximumDeposit: parseFloat(process.env.MAXIMUM_DEPOSIT ?? '10000.0'),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'debug',
  logFilePath: process.env.LOG_FILE_PATH || 'logs/app.log',
  logMaxFiles: process.env.LOG_MAX_FILES || '14d',
}));
