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
import { TransactionStatusEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Listing } from './listing.entity';

@Entity('listing_transactions')
@Check('chk_ltx_parties', '"provider_id" != "requester_id"')
@Check('chk_ltx_amount', '"amount_cents" >= 0')
@Check('chk_ltx_commission', '"commission_cents" >= 0')
@Index('idx_ltx_listing_status', ['listingId', 'status'])
@Index('idx_ltx_provider', ['providerId'])
@Index('idx_ltx_requester', ['requesterId'])
export class ListingTransaction {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'listing_id', type: 'uuid', nullable: false })
  listingId: string;

  @Column({ name: 'provider_id', type: 'uuid', nullable: false })
  providerId: string;

  @Column({ name: 'requester_id', type: 'uuid', nullable: false })
  requesterId: string;

  @Column({ name: 'amount_cents', type: 'int', nullable: false, default: 0 })
  amountCents: number;

  @Column({
    name: 'commission_cents',
    type: 'int',
    nullable: false,
    default: 0,
  })
  commissionCents: number;

  @Column({
    name: 'stripe_session_id',
    type: 'varchar',
    nullable: true,
    unique: true,
  })
  stripeSessionId: string | null;

  @Column({
    name: 'stripe_payment_intent',
    type: 'varchar',
    nullable: true,
    unique: true,
  })
  stripePaymentIntent: string | null;

  @Column({ name: 'contract_mongo_id', type: 'text', nullable: true })
  contractMongoId: string | null;

  @Column({ name: 'receipt_mongo_id', type: 'text', nullable: true })
  receiptMongoId: string | null;

  @Column({ name: 'payment_failed_reason', type: 'text', nullable: true })
  paymentFailedReason: string | null;

  @Column({
    type: 'enum',
    enum: TransactionStatusEnum,
    enumName: 'transaction_status_enum',
    default: TransactionStatusEnum.PENDING,
  })
  status: TransactionStatusEnum;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @ManyToOne(() => Listing)
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'provider_id' })
  provider: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'requester_id' })
  requester: User;
}
