import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_sessions')
@Index('uq_sessions_token_hash', ['refreshTokenHash'], { unique: true })
@Index('idx_sessions_user', ['userId'])
@Index('idx_sessions_expiry', ['expiresAt'])
@Index('idx_sessions_revoked', ['revokedAt'])
export class UserSession {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'refresh_token_hash', type: 'varchar' })
  refreshTokenHash: string;

  @Column({ name: 'device_name', type: 'varchar', nullable: true })
  deviceName: string | null;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', default: () => 'now()' })
  lastUsedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
