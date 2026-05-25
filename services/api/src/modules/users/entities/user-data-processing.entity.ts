import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_data_processing')
export class UserDataProcessing {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    name: 'opt_outs',
    type: 'text',
    array: true,
    nullable: false,
    default: () => "'{}'::text[]",
  })
  optOuts: string[];

  @Column({ name: 'is_restricted', type: 'boolean', nullable: false, default: false })
  isRestricted: boolean;

  @Column({ name: 'restricted_at', type: 'timestamptz', nullable: true })
  restrictedAt: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;
}
