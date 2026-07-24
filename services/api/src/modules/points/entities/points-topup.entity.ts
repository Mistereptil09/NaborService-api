import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { PointsTopupStatusEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('points_topups')
@Check('chk_topup_amount', '"amount_cents" > 0')
@Check('chk_topup_points', '"points_purchased" > 0')
@Index('idx_topup_user', ['userId'])
export class PointsTopup {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  @Column({ name: 'amount_cents', type: 'int', nullable: false })
  amountCents: number;

  @Column({ name: 'points_purchased', type: 'int', nullable: false })
  pointsPurchased: number;

  @Column({ name: 'cents_per_point', type: 'int', nullable: false })
  centsPerPoint: number;

  @Column({
    type: 'enum',
    enum: PointsTopupStatusEnum,
    enumName: 'points_topup_status_enum',
    default: PointsTopupStatusEnum.PENDING,
  })
  status: PointsTopupStatusEnum;

  @Column({
    name: 'stripe_checkout_session_id',
    type: 'varchar',
    nullable: true,
    unique: true,
  })
  stripeCheckoutSessionId: string | null;

  @Column({
    name: 'stripe_payment_intent_id',
    type: 'varchar',
    nullable: true,
    unique: true,
  })
  stripePaymentIntentId: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
