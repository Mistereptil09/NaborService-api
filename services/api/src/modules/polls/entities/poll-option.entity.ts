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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Poll)
  @JoinColumn({ name: 'poll_id' })
  poll: Poll;
}
