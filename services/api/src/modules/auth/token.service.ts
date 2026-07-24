import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { User } from '../users/entities/user.entity';
import { RedisRefreshPayload } from './interfaces/auth.interfaces';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  generateAccessToken(user: User): string {
    const payload = {
      sub: user.id,
      role: user.role,
      locale: user.locale,
    };
    return this.jwtService.sign(payload, {
      expiresIn: '15m',
      algorithm: 'HS256',
    });
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(48).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async storeRefreshInRedis(
    hash: string,
    userId: string,
    sessionId: string,
    expiresAt: Date,
  ): Promise<void> {
    const key = `refresh:${hash}`;
    const payload: RedisRefreshPayload = {
      user_id: userId,
      session_id: sessionId,
      expires_at: expiresAt.toISOString(),
    };

    await this.redis.set(key, JSON.stringify(payload), 'EX', 2592000);
  }

  async deleteRefreshFromRedis(hash: string): Promise<void> {
    const key = `refresh:${hash}`;
    await this.redis.del(key);
  }

  async lookupRefreshInRedis(
    hash: string,
  ): Promise<RedisRefreshPayload | null> {
    const key = `refresh:${hash}`;
    const data = await this.redis.get(key);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as RedisRefreshPayload;
    } catch {
      return null;
    }
  }
}
