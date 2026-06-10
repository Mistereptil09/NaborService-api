import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import {
  IncidentSeverityEnum,
  IncidentStatusEnum,
} from '../../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('incidents')
@Index('idx_incidents_feed', ['neighbourhoodId', 'status'])
@Index('idx_incidents_severity', ['severity'])
@Index('idx_incidents_assigned', ['assignedTo'])
export class Incident {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'reporter_id', type: 'uuid', nullable: false })
  reporterId: string;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string | null;

  @Column({ name: 'neighbourhood_id', type: 'text', nullable: true })
  neighbourhoodId: string | null;

  @Column({ name: 'mongo_document_id', type: 'text', nullable: true })
  mongoDocumentId: string | null;

  @Column({ type: 'varchar', nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: IncidentSeverityEnum,
    enumName: 'incident_severity_enum',
    default: IncidentSeverityEnum.MEDIUM,
  })
  severity: IncidentSeverityEnum;

  @Column({
    type: 'enum',
    enum: IncidentStatusEnum,
    enumName: 'incident_status_enum',
    default: IncidentStatusEnum.OPEN,
  })
  status: IncidentStatusEnum;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignee: User | null;
}
