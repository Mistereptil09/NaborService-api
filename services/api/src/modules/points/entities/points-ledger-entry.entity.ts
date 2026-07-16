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
import { PointsLedgerEntryTypeEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('points_ledger_entries')
@Check('chk_ple_amount_nonzero', '"amount_points" != 0')
@Index('idx_ple_user_created', ['userId', 'createdAt'])
@Index('idx_ple_type', ['type'])
@Index('idx_ple_reference', ['referenceType', 'referenceId'])
export class PointsLedgerEntry {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  // null only for platform-side bookkeeping entries (e.g. commission) that
  // don't belong to any single user's wallet.
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({
    type: 'enum',
    enum: PointsLedgerEntryTypeEnum,
    enumName: 'points_ledger_entry_type_enum',
  })
  type: PointsLedgerEntryTypeEnum;

  // signed: positive = credit, negative = debit
  @Column({ name: 'amount_points', type: 'int', nullable: false })
  amountPoints: number;

  // snapshot of the user's pointsBalance immediately after this entry was
  // applied; null when userId is null (no wallet was touched).
  @Column({ name: 'balance_after_points', type: 'int', nullable: true })
  balanceAfterPoints: number | null;

  @Column({ name: 'reference_type', type: 'varchar', nullable: true })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}
