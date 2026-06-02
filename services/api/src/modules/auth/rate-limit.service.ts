import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { RateLimitResult } from './interfaces/auth.interfaces';

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

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

  /**
   * Tracks and enforces per-account login attempts.
   */
  async incrementLoginAttemptByUserId(userId: string): Promise<void> {
    const key = `ratelimit:login:${userId}`;
    const result = await this.check(key, 10, 900);
    if (!result.allowed) {
      throw new HttpException(
        'Trop de tentatives pour ce compte',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Tracks and enforces per-account TOTP attempts.
   */
  async incrementTotpAttempt(userId: string): Promise<void> {
    const key = `ratelimit:totp:${userId}`;
    const result = await this.check(key, 3, 300);
    if (!result.allowed) {
      throw new HttpException(
        'Trop de tentatives TOTP pour ce compte',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
