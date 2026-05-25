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

@Entity('follow')
@Check('chk_follow_self', '"follower_id" != "followed_id"')
@Index('idx_follow_reverse', ['followedId', 'followerId'])
export class Follow {
  @PrimaryColumn({ name: 'follower_id', type: 'uuid' })
  followerId: string;

  @PrimaryColumn({ name: 'followed_id', type: 'uuid' })
  followedId: string;

  @Column({
    name: 'followed_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  followedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'follower_id' })
  follower: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'followed_id' })
  followed: User;
}
