import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('sync_conflicts')
export class SyncConflict {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  clientData: any;

  @Column({ type: 'jsonb', nullable: true })
  serverData: any;

  @Column({ default: false })
  resolved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
