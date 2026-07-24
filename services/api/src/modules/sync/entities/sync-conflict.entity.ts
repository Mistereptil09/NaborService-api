import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type ConflictResolution = 'local' | 'remote';

@Entity('sync_conflicts')
export class SyncConflict {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entity_type' })
  entityType: string;

  @Column({ name: 'entity_id' })
  entityId: string;

  @Column({ name: 'field_name', type: 'varchar', nullable: true })
  fieldName: string | null;

  @Column({ name: 'client_data', type: 'jsonb', nullable: true })
  clientData: any;

  @Column({ name: 'server_data', type: 'jsonb', nullable: true })
  serverData: any;

  @Column({ name: 'detected_at', type: 'timestamptz' })
  detectedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({
    name: 'resolution',
    type: 'enum',
    enum: ['local', 'remote'],
    nullable: true,
  })
  resolution: ConflictResolution | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  get resolved(): boolean {
    return this.resolution !== null;
  }
}
