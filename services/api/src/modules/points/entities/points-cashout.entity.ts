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
import { PointsCashoutStatusEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('points_cashouts')
@Check('chk_cashout_points', '"amount_points" > 0')
@Check('chk_cashout_amount', '"amount_cents" > 0')
@Index('idx_cashout_user', ['userId'])
export class PointsCashout {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  @Column({ name: 'amount_points', type: 'int', nullable: false })
  amountPoints: number;

  @Column({ name: 'amount_cents', type: 'int', nullable: false })
  amountCents: number;

  @Column({ name: 'cents_per_point', type: 'int', nullable: false })
  centsPerPoint: number;

  @Column({
    type: 'enum',
    enum: PointsCashoutStatusEnum,
    enumName: 'points_cashout_status_enum',
    default: PointsCashoutStatusEnum.PENDING,
  })
  status: PointsCashoutStatusEnum;

  @Column({
    name: 'stripe_transfer_id',
    type: 'varchar',
    nullable: true,
    unique: true,
  })
  stripeTransferId: string | null;

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
