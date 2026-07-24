import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { GroupRoleEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { ChatGroup } from './chat-group.entity';

@Entity('users_in_group')
@Check('chk_uig_left', '"left_at" IS NULL OR "left_at" > "joined_at"')
@Check('chk_uig_kicked', '"kicked_at" IS NULL OR "kicked_at" > "joined_at"')
@Index('idx_uig_group', ['groupId'])
export class UsersInGroup {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({
    name: 'role_in_group',
    type: 'enum',
    enum: GroupRoleEnum,
    enumName: 'group_role_enum',
    default: GroupRoleEnum.MESSAGE,
  })
  roleInGroup: GroupRoleEnum;

  @Column({
    name: 'joined_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  joinedAt: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date | null;

  @Column({ name: 'kicked_at', type: 'timestamptz', nullable: true })
  kickedAt: Date | null;

  @Column({
    name: 'is_muted',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  isMuted: boolean;

  @Column({ name: 'muted_until', type: 'timestamptz', nullable: true })
  mutedUntil: Date | null;

  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => ChatGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup;
}
