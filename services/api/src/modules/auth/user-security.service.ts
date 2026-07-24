import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { REDIS_CLIENT } from '../../database/redis.module';
import { User } from '../users/entities/user.entity';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Injectable()
export class UserSecurityService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @InjectQueue('email')
    private readonly emailQueue: Queue,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (user && user.deletedAt === null) {
      const resetToken = crypto.randomUUID();
      const redisKey = `auth:reset:${resetToken}`;

      await this.redis.set(
        redisKey,
        JSON.stringify({ email: user.email }),
        'EX',
        900,
      );

      const frontendUrl = this.config
        .get<string>('FRONTEND_URL', 'https://naborservice.com')
        .replace(/\/+$/, '');
      const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

      try {
        await this.emailQueue.add('send-email', {
          recipient: user.email,
          subject: 'Réinitialisation de votre mot de passe',
          subjectEn: 'Reset your password',
          templateName: 'reset-password',
          templateVariables: {
            resetLink,
            firstName: user.firstName,
          },
          essential: true,
        });
      } catch (error) {
        console.error('Failed to enqueue reset password email', error);
      }
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const redisKey = `auth:reset:${token}`;
    const data = await this.redis.get(redisKey);

    if (!data) {
      throw new BadRequestException('Token invalide ou expiré');
    }

    const payload = JSON.parse(data) as { email: string };
    const user = await this.userRepository.findOne({
      where: { email: payload.email },
    });

    if (!user || user.deletedAt !== null) {
      throw new BadRequestException('Token invalide ou expiré');
    }

    const salt = crypto.randomBytes(16);
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
      salt,
    });

    user.passwordHash = passwordHash;
    user.passwordChangedAt = new Date();
    await this.userRepository.save(user);

    await this.redis.del(redisKey);

    const activeSessions = await this.sessionService.findActiveByUser(user.id);
    for (const session of activeSessions) {
      await this.tokenService.deleteRefreshFromRedis(session.refreshTokenHash);
    }
    await this.sessionService.revokeAllUserSessions(user.id);
  }
}
