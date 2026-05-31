import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserNotificationPreferences } from '../../common/entities/user-notification-preferences.entity';
import { UserSession } from '../../common/entities/user-session.entity';
import { UserDataProcessing } from '../users/entities/user-data-processing.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { SessionService } from './session.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';

import { SsoService } from './sso.service';
import { UserSecurityService } from './user-security.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSession,
      UserNotificationPreferences,
      UserDataProcessing,
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
        signOptions: { expiresIn: '15m', algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionService,
    RateLimitService,
    TotpService,
    SsoService,
    UserSecurityService,
    JwtStrategy,
    JwtAuthGuard,
    RateLimitGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    SessionService,
    RateLimitService,
    TotpService,
    JwtModule,
  ],
})
export class AuthModule {}
