import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
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
  device_name: string;
  ip_address: string;
  created_at: string;
  access_token?: string;
  refresh_token?: string;
}

interface GenerateQrResult {
  qr: string; // base64 PNG data URI
  scanUrl: string; // full URL encoded in the QR, usable as a fallback link
}

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly ssoGateway: SsoGateway,
  ) {}

  async generateQr(ip: string, deviceName: string): Promise<GenerateQrResult> {
    try {
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
        device_name: deviceName,
        ip_address: ip,
        created_at: new Date().toISOString(),
      };

      await this.redis.set(ssoKey, JSON.stringify(payload), 'EX', 120);

      await this.redis.sadd(activeKeysSetKey, ssoKey);
      await this.redis.expire(activeKeysSetKey, 130);

      const qrcodeurl =
        process.env.FRONTEND_URL ??
        process.env.APP_BASE_URL ??
        'http://localhost:3000/v1';

      const deviceParam = encodeURIComponent(deviceName);
      const base = qrcodeurl.replace(/\/+$/, '');
      const scanUrl = `${base}/auth/sso/qr/validate?token=${tokenUuid}&device=${deviceParam}`;
      const qr = await qrcode.toDataURL(scanUrl);

      return { qr, scanUrl };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`SSO QR generation failed: ${error.message}`);
      throw new HttpException(
        'SSO service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

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

    const accessToken = this.tokenService.generateAccessToken(user);
    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const session = await this.sessionService.createSession({
      userId: user.id,
      refreshTokenHash,
      deviceName: payload.device_name,
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

    payload.status = 'validated';
    payload.user_id = user.id;
    payload.access_token = accessToken;
    payload.refresh_token = refreshToken;

    await this.redis.set(ssoKey, JSON.stringify(payload), 'EX', 60);

    this.ssoGateway.emitQrValidated(tokenUuid, accessToken, refreshToken);
  }

  async checkStatus(tokenUuid: string): Promise<{
    status: string;
    access_token?: string;
    refresh_token?: string;
  }> {
    const ssoKey = `sso:qr:${tokenUuid}`;

    try {
      const data = await this.redis.get(ssoKey);

      if (!data) {
        return { status: 'expired' };
      }

      const payload = JSON.parse(data) as SsoSessionPayload;
      if (payload.status === 'validated') {
        await this.redis.del(ssoKey).catch(() => {
          // Best-effort deletion — key may already be expired
        });
        return {
          status: 'validated',
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
        };
      }

      return { status: 'pending' };
    } catch (error: any) {
      this.logger.error(
        `SSO status check failed for token ${tokenUuid}: ${error.message}`,
      );
      return { status: 'pending' };
    }
  }
}
