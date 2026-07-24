import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { requireEnv, connectWithRetry } from './database.utils';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const host = requireEnv(config, 'REDIS_HOST', 'Redis');
        const port = config.get<number>('REDIS_PORT', 6379);
        const password = config.get<string>('REDIS_PASSWORD') || undefined;

        const client = await connectWithRetry('Redis', async () => {
          const redis = new Redis({
            host,
            port,
            password,
            maxRetriesPerRequest: null, // Required for BullMQ
            lazyConnect: true,
            retryStrategy: () => null, // Disable ioredis internal retries
            enableOfflineQueue: false,
          });

          redis.on('error', () => {});

          await redis.connect();
          return redis;
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
