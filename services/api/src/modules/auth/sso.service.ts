import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import * as qrcode from 'qrcode';
import { IsNull, Repository } from 'typeorm';
import { REDIS_CLIENT } from '../../database/redis.module';
import { User } from '../users/entities/user.entity';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { SsoGateway } from './sso.gateway';

interface SsoSessionPayload {
  status: 'pending' | 'validated';
  user_id: string | null;
  ip_address: string;
  created_at: string;
  access_token?: string;
  refresh_token?: string;
}

@Injectable()
export class SsoService {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly ssoGateway: SsoGateway,
  ) {}

  /**
   * Generates a new SSO QR code session and returns the QR code as a base64 PNG data URI.
   */
  async generateQr(ip: string): Promise<string> {
    const rateLimitKey = `rate:sso:generate:${ip}`;
    const rateCount = await this.redis.incr(rateLimitKey);
    if (rateCount === 1) {
      await this.redis.expire(rateLimitKey, 60);
    }
    if (rateCount > 5) {
      throw new HttpException(
        'Too many SSO requests from this IP',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const activeKeysSetKey = `sso:ip_keys:${ip}`;
    // Cleanup expired keys from the set first to get an accurate count
    const activeKeys = await this.redis.smembers(activeKeysSetKey);
    let validCount = 0;
    for (const key of activeKeys) {
      const exists = await this.redis.exists(key);
      if (exists) {
        validCount++;
      } else {
        await this.redis.srem(activeKeysSetKey, key);
      }
    }

    if (validCount >= 3) {
      throw new HttpException(
        'Too many active SSO sessions for this IP',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const tokenUuid = crypto.randomUUID();
    const ssoKey = `sso:qr:${tokenUuid}`;

    const payload: SsoSessionPayload = {
      status: 'pending',
      user_id: null,
      ip_address: ip,
      created_at: new Date().toISOString(),
    };

    // Store the session for 120 seconds
    await this.redis.set(ssoKey, JSON.stringify(payload), 'EX', 120);

    // Add to active keys set for the IP, set TTL slightly longer than session
    await this.redis.sadd(activeKeysSetKey, ssoKey);
    await this.redis.expire(activeKeysSetKey, 130);

    // Generate QR code data URI
    const qrDataUri = await qrcode.toDataURL(tokenUuid);
    return qrDataUri;
  }

  /**
   * Validates an SSO session from the authenticated web client.
   * Generates long-lived tokens for the Java Desktop client.
   */
  async validateQr(
    tokenUuid: string,
    userId: string,
    userAgent: string | null = null,
  ): Promise<void> {
    const ssoKey = `sso:qr:${tokenUuid}`;
    const data = await this.redis.get(ssoKey);

    if (!data) {
      throw new NotFoundException('Session SSO expirée ou introuvable');
    }

    const payload = JSON.parse(data) as SsoSessionPayload;
    if (payload.status !== 'pending') {
      throw new HttpException('Session SSO déjà validée', HttpStatus.CONFLICT);
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    // Generate tokens for desktop client (90 days validity)
    // The access token duration is normally fixed by JWT module (e.g. 15 mins),
    // but the refresh token gives a long-lived session.
    const accessToken = this.tokenService.generateAccessToken(user);
    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90); // 90 days session expiry for desktop

    // Create a database session for the desktop client
    const session = await this.sessionService.createSession({
      userId: user.id,
      refreshTokenHash,
      deviceName: 'Java Desktop Client (SSO)',
      ipAddress: payload.ip_address,
      userAgent: userAgent,
      expiresAt,
    });

    await this.tokenService.storeRefreshInRedis(
      refreshTokenHash,
      user.id,
      session.id,
      expiresAt,
    );

    // Update the Redis SSO session with the tokens and new status
    payload.status = 'validated';
    payload.user_id = user.id;
    payload.access_token = accessToken;
    payload.refresh_token = refreshToken;

    // Keep it valid in Redis for another 60 seconds so the client can retrieve it
    await this.redis.set(ssoKey, JSON.stringify(payload), 'EX', 60);

    this.ssoGateway.emitQrValidated(tokenUuid, accessToken, refreshToken);
  }

  /**
   * Checks the status of an SSO session. Used by the Java Desktop client.
   */
  async checkStatus(tokenUuid: string): Promise<{
    status: string;
    access_token?: string;
    refresh_token?: string;
  }> {
    const ssoKey = `sso:qr:${tokenUuid}`;
    const data = await this.redis.get(ssoKey);

    if (!data) {
      return { status: 'expired' };
    }

    const payload = JSON.parse(data) as SsoSessionPayload;
    if (payload.status === 'validated') {
      return {
        status: 'validated',
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      };
    }

    return { status: 'pending' };
  }
}
