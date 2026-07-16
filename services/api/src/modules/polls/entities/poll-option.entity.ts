import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Poll } from './poll.entity';

@Entity('poll_options')
@Index('idx_poll_options_poll', ['pollId'])
export class PollOption {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'poll_id', type: 'uuid', nullable: false })
  pollId: string;

  @Column({ type: 'varchar', nullable: false })
  label: string;

  /** Poids fixe attribué par le créateur du sondage (sondages de type "weighted"). Un vote pour cette option compte pour ce poids, quel que soit le votant. */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: false, default: 1 })
  weight: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Poll)
  @JoinColumn({ name: 'poll_id' })
  poll: Poll;
}
