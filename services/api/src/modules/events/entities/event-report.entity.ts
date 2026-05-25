import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Evenement } from './evenement.entity';

@Entity('event_reports')
@Index('idx_event_reports_event', ['eventId'])
@Index('idx_event_reports_resolved', ['resolvedAt'])
export class EventReport {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'event_id', type: 'uuid', nullable: false })
  eventId: string;

  @Column({ name: 'reporter_id', type: 'uuid', nullable: false })
  reporterId: string;

  @Column({ type: 'text', nullable: false })
  reason: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @ManyToOne(() => Evenement)
  @JoinColumn({ name: 'event_id' })
  event: Evenement;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;
}
