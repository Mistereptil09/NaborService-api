import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type ConflictResolution = 'local' | 'remote';

/**
 * Audit log of sync conflicts detected server-side during POST /sync/updates.
 *
 * This table is NOT a resolution queue — conflicts are resolved on the CLIENT
 * side (Java/SQLite). The server stores them purely for traceability and
 * debugging purposes. When a conflict is detected, the server reports it back
 * to the client, logs it here, and does NOT apply the conflicting change.
 * The client is expected to let the user resolve locally and re-push the
 * resolved version.
 */
@Entity('sync_conflicts')
export class SyncConflict {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entity_type' })
  entityType: string;

  @Column({ name: 'entity_id' })
  entityId: string;

  /** Per-field granularity — null means the entire record is in conflict. */
  @Column({ name: 'field_name', type: 'varchar', nullable: true })
  fieldName: string | null;

  @Column({ name: 'client_data', type: 'jsonb', nullable: true })
  clientData: any;

  @Column({ name: 'server_data', type: 'jsonb', nullable: true })
  serverData: any;

  /** Explicit detection timestamp (server clock). */
  @Column({ name: 'detected_at', type: 'timestamptz' })
  detectedAt: Date;

  /** When the conflict was resolved, NULL if still pending. */
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  /** Which side wins: 'local' (client version) or 'remote' (server version). */
  @Column({
    name: 'resolution',
    type: 'enum',
    enum: ['local', 'remote'],
    nullable: true,
  })
  resolution: ConflictResolution | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** Convenience getter — true when resolution has been chosen. */
  get resolved(): boolean {
    return this.resolution !== null;
  }
}
