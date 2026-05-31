import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan, Not } from 'typeorm';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { REDIS_CLIENT } from '../../database/redis.module';
import { User } from './entities/user.entity';
import { UserSession } from '../../common/entities/user-session.entity';
import { TotpService } from '../auth/totp.service';
import { ChangeEmailDto, ChangePasswordDto } from './dto/user-routes.dtos';
import { TokenService } from '../auth/token.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const otp = require('otplib');

@Injectable()
export class UserSecurityService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly totpService: TotpService,
    private readonly tokenService: TokenService,
  ) {}

  private async verifyUserTotp(userId: string, code: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!user.totpSecret) {
      throw new ForbiddenException('TOTP non configuré');
    }

    let secret: string;
    try {
      secret = this.totpService.decryptSecret(user.totpSecret);
    } catch {
      throw new ForbiddenException('Erreur de déchiffrement du secret');
    }

    const isValid = otp.verifySync({ token: code, secret, createDigest: crypto.createHmac });
    if (!isValid) {
      throw new ForbiddenException('TOTP requis ou invalide');
    }
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16);
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
      salt,
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto, currentRefreshToken?: string): Promise<void> {
    await this.verifyUserTotp(userId, dto.totpCode);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const isCurrentPasswordCorrect = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isCurrentPasswordCorrect) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    user.passwordHash = await this.hashPassword(dto.newPassword);
    user.passwordChangedAt = new Date();
    await this.userRepository.save(user);

    // Revoke other sessions
    let currentSessionId: string | null = null;
    if (currentRefreshToken) {
      const hash = this.tokenService.hashRefreshToken(currentRefreshToken);
      const session = await this.sessionRepository.findOne({ where: { refreshTokenHash: hash } });
      if (session) {
        currentSessionId = session.id;
      }
    }

    const revokeCondition: any = {
      userId,
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    };

    if (currentSessionId) {
      revokeCondition.id = Not(currentSessionId);
    }

    await this.sessionRepository.update(revokeCondition, {
      revokedAt: new Date(),
    });
  }

  async changeEmail(userId: string, dto: ChangeEmailDto): Promise<void> {
    await this.verifyUserTotp(userId, dto.totpCode);

    const existing = await this.userRepository.findOne({ where: { email: dto.newEmail } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Email déjà utilisé');
    }

    await this.userRepository.update(userId, { email: dto.newEmail });
  }
}
