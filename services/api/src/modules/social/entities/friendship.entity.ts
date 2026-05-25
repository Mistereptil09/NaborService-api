import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ChatGroup } from '../../messaging/entities/chat-group.entity';

@Entity('friendships')
@Check('chk_friendships_order', '"user1_id" < "user2_id"')
@Unique(['user1Id', 'user2Id'])
export class Friendship {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'user1_id', type: 'uuid', nullable: false })
  user1Id: string;

  @Column({ name: 'user2_id', type: 'uuid', nullable: false })
  user2Id: string;

  @Column({
    name: 'friended_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  friendedAt: Date;

  @Column({ name: 'unfriended_at', type: 'timestamptz', nullable: true })
  unfriendedAt: Date | null;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user1_id' })
  user1: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user2_id' })
  user2: User;

  @ManyToOne(() => ChatGroup, { nullable: true })
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup | null;
}
