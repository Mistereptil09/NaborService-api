import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { IsNull, Repository } from 'typeorm';
import { REDIS_CLIENT } from '../../database/redis.module';
import { User } from '../users/entities/user.entity';
import {
  ChallengePayload,
  TotpSetupPayload,
} from './interfaces/auth.interfaces';
import { RateLimitService } from './rate-limit.service';
import * as otp from 'otplib';

@Injectable()
export class TotpService {
  private readonly keyBuffer: Buffer;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
  ) {
    const key = this.configService.get<string>('AES_MASTER_KEY') || 'default-dev-aes-master-key-must-be-changed';
    
    // Parse key: if hex 64 chars -> Buffer from hex, otherwise scrypt
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
      this.keyBuffer = Buffer.from(key, 'hex');
    } else {
      this.keyBuffer = crypto.scryptSync(key, 'nabor_salt', 32);
    }
  }

  /**
   * Encrypts a TOTP secret using AES-256-GCM
   * Returns format: iv:authTag:ciphertext (base64url/base64)
   */
  encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.keyBuffer, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  /**
   * Decrypts an AES-256-GCM encrypted TOTP secret
   */
  decryptSecret(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted secret format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.keyBuffer, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  /**
   * Checks if the user is currently blocked from TOTP attempts
   */
  async isUserBlocked(userId: string): Promise<boolean> {
    const blockedKey = `totp:blocked:${userId}`;
    const blocked = await this.redis.exists(blockedKey);
    return blocked === 1;
  }

  /**
   * Creates a TOTP login challenge
   */
  async createChallenge(userId: string, context: string): Promise<string> {
    const challengeToken = crypto.randomUUID();
    const key = `totp:pending:${challengeToken}`;
    
    const payload: ChallengePayload = {
      user_id: userId,
      context,
      attempts: 0,
      created_at: new Date().toISOString(),
    };

    await this.redis.set(key, JSON.stringify(payload), 'EX', 300); // 5 minutes TTL
    return challengeToken;
  }

  /**
   * Verifies a TOTP code against a pending login challenge
   */
  async verifyChallenge(challengeToken: string, code: string): Promise<string> {
    const challengeKey = `totp:pending:${challengeToken}`;
    const data = await this.redis.get(challengeKey);
    
    if (!data) {
      throw new UnauthorizedException('Challenge expiré ou invalide');
    }

    const payload = JSON.parse(data) as ChallengePayload;
    const userId = payload.user_id;

    // Apply per-user TOTP rate limit
    await this.rateLimitService.incrementTotpAttempt(userId);

    // Check if user is blocked
    if (await this.isUserBlocked(userId)) {
      throw new HttpException(
        'Trop de tentatives, compte temporairement bloqué',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });

    if (!user || !user.totpSecret) {
      throw new UnauthorizedException('TOTP non configuré');
    }

    let secret: string;
    try {
      secret = this.decryptSecret(user.totpSecret);
    } catch {
      throw new UnauthorizedException('Erreur de déchiffrement du secret');
    }

    const result = otp.verifySync({ token: code, secret });
    const isValid = result?.valid === true;

    if (isValid) {
      await this.redis.del(challengeKey);
      return userId;
    }

    // Handle failure and attempts count
    const attempts = payload.attempts + 1;
    if (attempts >= 3) {
      // Block user for 15 minutes (900 seconds)
      const blockedKey = `totp:blocked:${userId}`;
      await this.redis.set(blockedKey, '1', 'EX', 900);
      await this.redis.del(challengeKey);

      throw new HttpException(
        'Trop de tentatives',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Update attempts
    payload.attempts = attempts;
    await this.redis.set(challengeKey, JSON.stringify(payload), 'EX', 300);

    throw new UnauthorizedException('Code TOTP invalide');
  }

  /**
   * Initiates TOTP setup during login using a challenge token
   */
  async createSetupChallenge(userId: string, email: string): Promise<{ challengeToken: string, otpauthUrl: string }> {
    const secret = otp.generateSecret();
    const otpauthUrl = otp.generateURI({ label: email, issuer: 'NaborServices', secret });

    const encrypted = this.encryptSecret(secret);
    const challengeToken = crypto.randomUUID();
    const setupKey = `totp:setup:${challengeToken}`;
    const payload: TotpSetupPayload = {
      user_id: userId,
      encrypted_secret: encrypted,
      attempts: 0,
    };

    await this.redis.set(setupKey, JSON.stringify(payload), 'EX', 600); // 10 minutes TTL
    return { challengeToken, otpauthUrl };
  }

  /**
   * Confirms TOTP setup using a challenge token and returns the user ID
   */
  async verifySetupChallenge(challengeToken: string, code: string): Promise<string> {
    const setupKey = `totp:setup:${challengeToken}`;
    const data = await this.redis.get(setupKey);

    if (!data) {
      throw new UnauthorizedException('Setup expiré ou non initié');
    }

    const payload = JSON.parse(data) as TotpSetupPayload;
    if (!payload.user_id) {
      throw new UnauthorizedException('Invalid setup payload');
    }

    // Apply per-user TOTP rate limit
    await this.rateLimitService.incrementTotpAttempt(payload.user_id);

    let secret: string;
    try {
      secret = this.decryptSecret(payload.encrypted_secret);
    } catch {
      throw new UnauthorizedException('Erreur de déchiffrement du secret');
    }

    const result = otp.verifySync({ token: code, secret });
    const isValid = result?.valid === true;

    if (isValid) {
      const user = await this.userRepository.findOne({
        where: { id: payload.user_id },
      });
      if (!user) {
        throw new UnauthorizedException('Utilisateur introuvable');
      }

      user.totpSecret = payload.encrypted_secret;
      await this.userRepository.save(user);
      await this.redis.del(setupKey);
      return user.id;
    }

    const attempts = payload.attempts + 1;
    if (attempts >= 3) {
      await this.redis.del(setupKey);
      throw new HttpException(
        'Setup expiré, relancez le flux',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    payload.attempts = attempts;
    await this.redis.set(setupKey, JSON.stringify(payload), 'EX', 600);

    throw new UnauthorizedException('Code TOTP invalide');
  }

  /**
   * Initiates TOTP setup for a user
   */
  async setupTotp(userId: string, email: string): Promise<{ otpauthUrl: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    if (user.totpSecret) {
      throw new ConflictException('TOTP déjà configuré');
    }

    const secret = otp.generateSecret();
    const otpauthUrl = otp.generateURI({ label: email, issuer: 'NaborServices', secret });

    const encrypted = this.encryptSecret(secret);
    const setupKey = `totp:setup:${userId}`;
    const payload: TotpSetupPayload = {
      encrypted_secret: encrypted,
      attempts: 0,
    };

    await this.redis.set(setupKey, JSON.stringify(payload), 'EX', 600); // 10 minutes TTL
    return { otpauthUrl };
  }

  /**
   * Confirms TOTP setup for a user
   */
  async confirmTotp(userId: string, code: string): Promise<void> {
    const setupKey = `totp:setup:${userId}`;
    const data = await this.redis.get(setupKey);

    if (!data) {
      throw new UnauthorizedException('Setup expiré ou non initié');
    }

    const payload = JSON.parse(data) as TotpSetupPayload;
    let secret: string;
    try {
      secret = this.decryptSecret(payload.encrypted_secret);
    } catch {
      throw new UnauthorizedException('Erreur de déchiffrement du secret');
    }

    const result = otp.verifySync({ token: code, secret });
    const isValid = result?.valid === true;

    if (isValid) {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (!user) {
        throw new UnauthorizedException('Utilisateur introuvable');
      }

      user.totpSecret = payload.encrypted_secret;
      await this.userRepository.save(user);
      await this.redis.del(setupKey);
      return;
    }

    const attempts = payload.attempts + 1;
    if (attempts >= 3) {
      await this.redis.del(setupKey);
      throw new HttpException(
        'Setup expiré, relancez le flux',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    payload.attempts = attempts;
    await this.redis.set(setupKey, JSON.stringify(payload), 'EX', 600);

    throw new UnauthorizedException('Code TOTP invalide');
  }

  /**
   * Disables TOTP for a user after verifying a code
   */
  async disableTotp(userId: string, code: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });

    if (!user || !user.totpSecret) {
      throw new UnauthorizedException('TOTP non configuré');
    }

    // Apply per-user TOTP rate limit
    await this.rateLimitService.incrementTotpAttempt(userId);

    let secret: string;
    try {
      secret = this.decryptSecret(user.totpSecret);
    } catch {
      throw new UnauthorizedException('Erreur de déchiffrement du secret');
    }

    const result = otp.verifySync({ token: code, secret });
    const isValid = result?.valid === true;

    if (!isValid) {
      throw new UnauthorizedException('Code TOTP invalide');
    }

    user.totpSecret = null;
    await this.userRepository.save(user);
  }
}
