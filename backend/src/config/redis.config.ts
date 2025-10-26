import { registerAs } from '@nestjs/config';
import { CacheModuleOptions } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

export const redisConfig = registerAs(
  'redis',
  async (): Promise<CacheModuleOptions> => ({
    store: await redisStore({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      },
      ttl: parseInt(process.env.REDIS_TTL ?? '3600', 10), // Default 1 hour
    }),
    isGlobal: true,
  }),
);
