import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserNotificationPreferences } from '../../common/entities/user-notification-preferences.entity';
import { UserDataProcessing } from '../users/entities/user-data-processing.entity';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly totpService: TotpService,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  /**
   * Registers a new user.
   * Uses Argon2id for password hashing and inserts default notification preferences atomically in a transaction.
   */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(User, {
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Email déjà utilisé');
      }

      // Generate a cryptographically secure 16-byte random salt
      const salt = crypto.randomBytes(16);

      // Hash password using Argon2id with exact spec parameters
      const passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64 MiB
        timeCost: 3,
        parallelism: 1,
        hashLength: 32,
        salt,
      });

      const user = manager.create(User, {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
      });
      const savedUser = await manager.save(user);

      // Create notification preferences atomically with all fields set to true
      const preferences = manager.create(UserNotificationPreferences, {
        userId: savedUser.id,
        notifNewFollower: true,
        notifNewListing: true,
        notifNewEvent: true,
        notifNewPoll: true,
        notifWaitlist: true,
        notifMessage: true,
      });
      await manager.save(preferences);

      // Create data processing preferences atomically
      const dataProcessing = manager.create(UserDataProcessing, {
        userId: savedUser.id,
        optOuts: [],
        isRestricted: false,
      });
      await manager.save(dataProcessing);

      return { message: 'Compte créé avec succès' };
    });
  }

  /**
   * Authenticates a user.
   * Implements secure credentials non-disclosure and branches depending on TOTP configuration.
   */
  async login(
    dto: LoginDto,
    ip: string | null = null,
    userAgent: string | null = null,
  ): Promise<{
    challenge: string;
    challenge_token: string;
    otpauthUrl?: string;
  }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    // Uniform response to prevent email harvesting and account existence leaks.
    // Also checks if the account is soft-deleted.
    if (!user || user.deletedAt !== null) {
      // Execute dummy verify with equivalent work to prevent timing analysis
      await argon2.verify(
        '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$dGVzdHBhc3N3b3Jk',
        dto.password,
      );
      throw new UnauthorizedException('Identifiants invalides');
    }

    // Apply per-user rate limit now that we know the account exists
    await this.rateLimitService.incrementLoginAttemptByUserId(user.id);

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    // Branching login flow depending on whether TOTP is enabled
    if (user.totpSecret) {
      // Check if user is blocked due to excessive TOTP failures
      const isBlocked = await this.totpService.isUserBlocked(user.id);
      if (isBlocked) {
        throw new HttpException(
          'Trop de tentatives, compte temporairement bloqué',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const challengeToken = await this.totpService.createChallenge(
        user.id,
        'login',
      );
      return {
        challenge: 'totp_required',
        challenge_token: challengeToken,
      };
    }

    // TOTP not enabled (mandatory setup at registration/first login)
    const { challengeToken, otpauthUrl } =
      await this.totpService.createSetupChallenge(user.id, user.email);

    return {
      challenge: 'totp_setup_required',
      challenge_token: challengeToken,
      otpauthUrl,
    };
  }
}
