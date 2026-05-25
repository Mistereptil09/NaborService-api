import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { RateLimitResult } from './interfaces/auth.interfaces';

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Checks if a request is allowed under the rate limit configuration.
   * Uses Redis INCR + EXPIRE to track requests within a sliding/fixed window.
   */
  async check(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const current = await this.redis.get(key);
    
    if (current && parseInt(current, 10) >= limit) {
      const ttl = await this.redis.ttl(key);
      const retryAfter = ttl > 0 ? ttl : windowSeconds;
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
      };
    }

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    
    let retryAfter = 0;
    if (!allowed) {
      const ttl = await this.redis.ttl(key);
      retryAfter = ttl > 0 ? ttl : windowSeconds;
    }

    return {
      allowed,
      remaining,
      retryAfter,
    };
  }
}
