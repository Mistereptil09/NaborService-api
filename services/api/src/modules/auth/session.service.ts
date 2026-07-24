import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UserSession } from '../../common/entities/user-session.entity';
import { CreateSessionParams } from './interfaces/auth.interfaces';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
  ) {}

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

  async findSessionById(id: string): Promise<UserSession | null> {
    return this.sessionRepository.findOne({
      where: { id },
    });
  }

  async findByTokenHash(hash: string): Promise<UserSession | null> {
    return this.sessionRepository.findOne({
      where: { refreshTokenHash: hash },
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      revokedAt: new Date(),
    });
  }

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

  async updateLastUsed(sessionId: string, newHash: string): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      refreshTokenHash: newHash,
      lastUsedAt: new Date(),
    });
  }
}
