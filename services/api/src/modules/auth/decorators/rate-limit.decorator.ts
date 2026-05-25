import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  /** Redis key prefix (e.g. 'login', 'refresh') */
  prefix: string;
  /** Maximum number of requests allowed within the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * Decorator that attaches rate limit configuration to a route handler.
 * Used by RateLimitGuard to enforce per-endpoint rate limiting.
 *
 * @param prefix - Redis key prefix (e.g. 'login', 'refresh')
 * @param limit - Maximum number of requests allowed within the window
 * @param windowSeconds - Time window in seconds
 *
 * @example
 * // 10 requests per 15 minutes
 * @RateLimit('login', 10, 900)
 *
 * // 10 requests per 1 minute
 * @RateLimit('refresh', 10, 60)
 */
export const RateLimit = (
  prefix: string,
  limit: number,
  windowSeconds: number,
) => SetMetadata(RATE_LIMIT_KEY, { prefix, limit, windowSeconds } as RateLimitOptions);
