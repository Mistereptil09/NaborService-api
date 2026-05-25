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
import { UserSession } from '../auth/entities/user-session.entity';
import { TotpService } from '../auth/totp.service';
import { ChangeEmailDto, ChangePasswordDto } from './dto/user-routes.dtos';
import { TokenService } from '../auth/token.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticator } = require('otplib');

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

    const isValid = authenticator.verify({ token: code, secret });
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

  async requestPasswordReset(email: string): Promise<void> {
    const rateLimitKey = `rate:password-reset:${email}`;
    const attempts = await this.redis.get(rateLimitKey);
    const count = attempts ? parseInt(attempts, 10) : 0;

    if (count >= 3) {
      throw new HttpException(
        'Trop de demandes de réinitialisation. Veuillez réessayer dans une heure.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment rate limit counter
    await this.redis.set(rateLimitKey, (count + 1).toString(), 'EX', 3600);

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      // Return 200 OK without disclosing account existence
      return;
    }

    const token = crypto.randomUUID();
    const tokenKey = `password-reset:${token}`;
    await this.redis.set(tokenKey, user.id, 'EX', 900); // 15 minutes TTL

    // In a real environment, we'd trigger bull:email queue to dispatch the reset link.
    // In dev / test, we'll log it.
    console.log(`Password reset link: http://localhost:3000/v1/users/password-reset/confirm?token=${token}`);
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const tokenKey = `password-reset:${token}`;
    const userId = await this.redis.get(tokenKey);

    if (!userId) {
      throw new BadRequestException('Token invalide ou expiré');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    user.passwordHash = await this.hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    await this.userRepository.save(user);

    // Delete token and revoke all user sessions
    await this.redis.del(tokenKey);
    await this.sessionRepository.update(
      {
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      {
        revokedAt: new Date(),
      },
    );
  }
}
