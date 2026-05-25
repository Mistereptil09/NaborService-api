import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { SwipeDirectionEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('user_swipes')
@Check('chk_swipe_self', '"swiper_id" != "swiped_id"')
@Index('idx_user_swipes_swiped_dir', ['swipedId', 'direction'])
export class UserSwipe {
  @PrimaryColumn({ name: 'swiper_id', type: 'uuid' })
  swiperId: string;

  @PrimaryColumn({ name: 'swiped_id', type: 'uuid' })
  swipedId: string;

  @Column({
    type: 'enum',
    enum: SwipeDirectionEnum,
    enumName: 'swipe_direction_enum',
  })
  direction: SwipeDirectionEnum;

  @Column({
    name: 'swiped_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  swipedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'swiper_id' })
  swiper: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'swiped_id' })
  swiped: User;
}
