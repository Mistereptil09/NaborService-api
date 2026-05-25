import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserNotificationPreferences } from './entities/user-notification-preferences.entity';
import { UserSession } from './entities/user-session.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { SessionService } from './session.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSession, UserNotificationPreferences]),
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
  ],
})
export class AuthModule {}
