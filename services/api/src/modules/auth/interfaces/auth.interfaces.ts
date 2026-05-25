import { UserRoleEnum } from '../../../common/enums';

/**
 * Stored in Redis under `refresh:<sha256_hash>`.
 * Fast-path lookup for refresh token validation.
 * TTL: 30 days (2,592,000s).
 */
export interface RedisRefreshPayload {
  user_id: string;
  session_id: string;
  expires_at: string; // ISO 8601 timestamp
}

/**
 * Stored in Redis under `totp:pending:<challenge_token>`.
 * Holds state for a TOTP challenge during two-step login.
 * TTL: 5 min (300s).
 */
export interface ChallengePayload {
  user_id: string;
  context: string;
  attempts: number;
  created_at: string; // ISO 8601 timestamp
}

/**
 * Stored in Redis under `totp:setup:<user_id>`.
 * Holds the encrypted TOTP secret during the setup confirmation flow.
 * TTL: 10 min (600s).
 */
export interface TotpSetupPayload {
  encrypted_secret: string;
  attempts: number;
}

/**
 * Returned by RateLimitService.check().
 * Indicates whether the request is allowed and provides rate limit metadata.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until window reset
}

/**
 * Parameters for SessionService.createSession().
 * Used when creating a new user session after successful authentication.
 */
export interface CreateSessionParams {
  userId: string;
  refreshTokenHash: string;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
}

/**
 * Returned by JwtStrategy.validate().
 * Represents the authenticated user attached to the request.
 */
export interface RequestUser {
  sub: string;
  role: UserRoleEnum;
  locale: string;
}

/**
 * JWT access token payload.
 * Signed with HS256, 15 min expiry.
 */
export interface JwtPayload {
  sub: string;
  role: UserRoleEnum;
  locale: string;
  iat: number;
  exp: number;
}
