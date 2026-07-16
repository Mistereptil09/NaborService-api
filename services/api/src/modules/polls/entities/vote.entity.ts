import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PollOption } from './poll-option.entity';

@Entity('votes')
@Check('chk_vote_weight', '"weight" >= 0')
export class Vote {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'option_id', type: 'uuid' })
  optionId: string;

  /** Copié depuis `PollOption.weight` au moment du vote — jamais choisi par le votant. */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: false, default: 1 })
  weight: number;

  @Column({
    name: 'voted_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  votedAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => PollOption)
  @JoinColumn({ name: 'option_id' })
  option: PollOption;
}
