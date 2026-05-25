import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { EventStatusEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { EvenementsCategory } from './evenements-category.entity';
import { ChatGroup } from '../../messaging/entities/chat-group.entity';

@Entity('evenements')
@Check('chk_event_dates', '"ends_at" IS NULL OR "ends_at" > "starts_at"')
@Check('chk_event_cost', '"cost_cents" >= 0')
@Check(
  'chk_event_participants',
  '"max_participants" IS NULL OR "max_participants" >= 1',
)
@Check('chk_event_refund', '"refund_deadline_hours" >= 0')
@Index('idx_events_feed', ['neighbourhoodId', 'status', 'startsAt'])
@Index('idx_events_creator', ['creatorId'])
@Index('idx_events_group', ['groupId'])
export class Evenement {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'creator_id', type: 'uuid', nullable: false })
  creatorId: string;

  @Column({ name: 'neighbourhood_id', type: 'text', nullable: true })
  neighbourhoodId: string | null;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

  @Column({ type: 'varchar', nullable: false })
  title: string;

  @Column({
    type: 'enum',
    enum: EventStatusEnum,
    enumName: 'event_status_enum',
    default: EventStatusEnum.DRAFT,
  })
  status: EventStatusEnum;

  @Column({ name: 'invite_code', type: 'varchar', nullable: true })
  inviteCode: string | null;

  @Column({ name: 'cost_cents', type: 'int', nullable: false, default: 0 })
  costCents: number;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ name: 'max_participants', type: 'int', nullable: true })
  maxParticipants: number | null;

  @Column({
    name: 'refund_deadline_hours',
    type: 'int',
    nullable: false,
    default: 48,
  })
  refundDeadlineHours: number;

  @Column({ name: 'mongo_document_id', type: 'text', nullable: true })
  mongoDocumentId: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @ManyToOne(() => EvenementsCategory, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: EvenementsCategory | null;

  @ManyToOne(() => ChatGroup, { nullable: true })
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup | null;
}
