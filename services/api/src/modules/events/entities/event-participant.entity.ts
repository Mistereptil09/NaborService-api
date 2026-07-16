import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import {
  ParticipantStatusEnum,
  PaymentStatusEnum,
} from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Evenement } from './evenement.entity';

@Entity('event_participants')
@Check('chk_ep_amount', '"amount_points" >= 0')
@Index('idx_ep_event_status_fifo', ['eventId', 'status', 'registeredAt'])
export class EventParticipant {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({
    type: 'enum',
    enum: ParticipantStatusEnum,
    enumName: 'participant_status_enum',
    default: ParticipantStatusEnum.WAITLISTED,
  })
  status: ParticipantStatusEnum;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatusEnum,
    enumName: 'payment_status_enum',
    default: PaymentStatusEnum.FREE,
  })
  paymentStatus: PaymentStatusEnum;

  @Column({ name: 'amount_points', type: 'int', nullable: false, default: 0 })
  amountPoints: number;

  @Column({
    name: 'registered_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  registeredAt: Date;

  @Column({ name: 'promoted_at', type: 'timestamptz', nullable: true })
  promotedAt: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Evenement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: Evenement;
}
