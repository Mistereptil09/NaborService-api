import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { SwipeDirectionEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Evenement } from './evenement.entity';

@Entity('event_swipes')
@Index('idx_event_swipes_dir', ['eventId', 'direction'])
export class EventSwipe {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'event_id', type: 'uuid' })
  eventId: string;

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
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Evenement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: Evenement;
}
