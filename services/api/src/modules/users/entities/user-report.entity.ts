import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_reports')
export class UserReport {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'reported_id', type: 'uuid', nullable: false })
  reportedId: string;

  @Column({ name: 'reporter_id', type: 'uuid', nullable: false })
  reporterId: string;

  @Column({ type: 'text', nullable: false })
  reason: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
