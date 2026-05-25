import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ModerationActionEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Evenement } from './evenement.entity';

@Entity('event_moderation_actions')
@Index('idx_event_moderation_actions_event', ['eventId'])
export class EventModerationAction {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'event_id', type: 'uuid', nullable: false })
  eventId: string;

  @Column({ name: 'moderator_id', type: 'uuid', nullable: false })
  moderatorId: string;

  @Column({
    type: 'enum',
    enum: ModerationActionEnum,
    enumName: 'moderation_action_enum',
  })
  action: ModerationActionEnum;

  @Column({ type: 'text', nullable: false })
  reason: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Evenement)
  @JoinColumn({ name: 'event_id' })
  event: Evenement;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'moderator_id' })
  moderator: User;
}
