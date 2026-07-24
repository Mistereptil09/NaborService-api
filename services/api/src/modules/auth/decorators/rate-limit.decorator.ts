import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  prefix: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rate_limit';

export const RateLimit = (
  prefix: string,
  limit: number,
  windowSeconds: number,
) =>
  SetMetadata(RATE_LIMIT_KEY, {
    prefix,
    limit,
    windowSeconds,
  });
