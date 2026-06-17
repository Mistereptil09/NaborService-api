import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type NotificationType =
  | 'new_message'
  | 'new_event'
  | 'new_listing_interest'
  | 'listing_accepted'
  | 'contract_pending'
  | 'contract_signed'
  | 'payment_confirmed'
  | 'waitlist_place'
  | 'new_follower'
  | 'new_poll'
  | 'incident_resolved'
  | 'event_cancelled';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column('uuid')
  userId!: string;

  @Column('varchar')
  type!: NotificationType;

  @Column('jsonb', { nullable: true })
  payload!: Record<string, unknown> | null;

  @Column('boolean', { default: false })
  read!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
