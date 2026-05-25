import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_blocks')
@Check('chk_block_self', '"blocker_id" != "blocked_id"')
@Index('idx_user_blocks_blocked', ['blockedId'])
export class UserBlock {
  @PrimaryColumn({ name: 'blocker_id', type: 'uuid' })
  blockerId: string;

  @PrimaryColumn({ name: 'blocked_id', type: 'uuid' })
  blockedId: string;

  @Column({
    name: 'blocked_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  blockedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocker_id' })
  blocker: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocked_id' })
  blocked: User;
}
