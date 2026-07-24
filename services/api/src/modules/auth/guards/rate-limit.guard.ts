import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../database/redis.module';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { RateLimitService } from '../rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    let key: string;

    if (options.prefix === 'login') {
      const ip = request.ip || this.getIpAddress(request);
      key = `ratelimit:login:${ip}`;
    } else if (options.prefix === 'refresh') {
      const token = this.extractRefreshTokenFromCookie(request);
      if (!token) {
        return true;
      }
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const data = await this.redis.get(`refresh:${hash}`);
      if (!data) {
        return true;
      }
      try {
        const payload = JSON.parse(data);
        key = `ratelimit:refresh:${payload.user_id}`;
      } catch {
        return true;
      }
    } else {
      const userId = request.user?.sub;
      if (userId) {
        key = `ratelimit:${options.prefix}:${userId}`;
      } else {
        const ip = request.ip || this.getIpAddress(request);
        key = `ratelimit:${options.prefix}:${ip}`;
      }
    }

    const result = await this.rateLimitService.check(
      key,
      options.limit,
      options.windowSeconds,
    );

    if (!result.allowed) {
      const response = context.switchToHttp().getResponse();
      response.header('Retry-After', result.retryAfter.toString());
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Trop de requêtes',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getIpAddress(request: any): string {
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (xForwardedFor && typeof xForwardedFor === 'string') {
      return xForwardedFor.split(',')[0].trim();
    }
    return request.connection?.remoteAddress || '127.0.0.1';
  }

  private extractRefreshTokenFromCookie(request: any): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const parts = cookie.split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        acc[name] = value;
      }
      return acc;
    }, {});
    return cookies['refresh_token'];
  }
}
