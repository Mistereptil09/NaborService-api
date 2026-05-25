import {
  Column,
  Check,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_sessions')
@Check('chk_session_expiry', '"expires_at" > "created_at"')
@Index('idx_sessions_refresh_token', ['refreshTokenHash'], { unique: true })
@Index('idx_sessions_user', ['userId'])
@Index('idx_sessions_expires', ['expiresAt'])
@Index('idx_sessions_revoked', ['revokedAt'])
export class UserSession {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  @Column({ name: 'refresh_token_hash', type: 'varchar', nullable: false })
  refreshTokenHash: string;

  @Column({ name: 'device_name', type: 'varchar', nullable: true })
  deviceName: string | null;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  createdAt: Date;

  @Column({
    name: 'last_used_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  lastUsedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: false })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
