import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('platform_configs')
export class PlatformConfig {
  @PrimaryColumn({ type: 'integer' })
  id!: number;

  @Column({ name: 'commission_percent', type: 'integer', default: 5 })
  commissionPercent!: number;

  @Column({ name: 'refund_deadline_hours', type: 'integer', default: 48 })
  refundDeadlineHours!: number;

  @Column({ name: 'contract_expiration_hours', type: 'integer', default: 24 })
  contractExpirationHours!: number;

  @Column({ name: 'waitlist_confirm_hours', type: 'integer', default: 24 })
  waitlistConfirmHours!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
