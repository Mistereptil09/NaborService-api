import { UserRoleEnum } from '../../../common/enums';

export interface RedisRefreshPayload {
  user_id: string;
  session_id: string;
  expires_at: string; // ISO 8601 timestamp
}

export interface ChallengePayload {
  user_id: string;
  context: string;
  attempts: number;
  created_at: string; // ISO 8601 timestamp
}

export interface TotpSetupPayload {
  user_id?: string;
  encrypted_secret: string;
  attempts: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until window reset
}

export interface CreateSessionParams {
  userId: string;
  refreshTokenHash: string;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
}

export interface RequestUser {
  sub: string;
  role: UserRoleEnum;
  locale: string;
}

export interface JwtPayload {
  sub: string;
  role: UserRoleEnum;
  locale: string;
  iat: number;
  exp: number;
}
