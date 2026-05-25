import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UserSession } from './entities/user-session.entity';
import { CreateSessionParams } from './interfaces/auth.interfaces';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
  ) {}

  /**
   * Creates a new user session in PostgreSQL
   */
  async createSession(params: CreateSessionParams): Promise<UserSession> {
    const session = this.sessionRepository.create({
      userId: params.userId,
      refreshTokenHash: params.refreshTokenHash,
      deviceName: params.deviceName,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      expiresAt: params.expiresAt,
    });
    return this.sessionRepository.save(session);
  }

  /**
   * Finds active sessions for a user (revoked_at IS NULL and expires_at > now())
   */
  async findActiveByUser(userId: string): Promise<UserSession[]> {
    return this.sessionRepository.find({
      where: {
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: {
        lastUsedAt: 'DESC',
      },
    });
  }

  /**
   * Looks up a session by ID
   */
  async findSessionById(id: string): Promise<UserSession | null> {
    return this.sessionRepository.findOne({
      where: { id },
    });
  }

  /**
   * Looks up a session by refresh token hash (even if expired or revoked, for validation/audit)
   */
  async findByTokenHash(hash: string): Promise<UserSession | null> {
    return this.sessionRepository.findOne({
      where: { refreshTokenHash: hash },
    });
  }

  /**
   * Revokes a specific session by setting revoked_at = now()
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      revokedAt: new Date(),
    });
  }

  /**
   * Revokes all active sessions for a user by setting revoked_at = now()
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
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

  /**
   * Updates a session's refresh token hash and last used timestamp (on rotation)
   */
  async updateLastUsed(sessionId: string, newHash: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      refreshTokenHash: newHash,
      lastUsedAt: new Date(),
    });
  }
}
