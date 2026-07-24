import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { CallTypeEnum, CallStatusEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { ChatGroup } from '../../messaging/entities/chat-group.entity';

@Entity('call_logs')
@Index('idx_call_logs_group', ['groupId'])
export class CallLog {
  @PrimaryColumn({ type: 'uuid' })
  callId: string;

  @Column({ name: 'group_id', type: 'uuid', nullable: false })
  groupId: string;

  @ManyToOne(() => ChatGroup)
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup;

  @Column({
    type: 'enum',
    enum: CallTypeEnum,
    enumName: 'call_type_enum',
  })
  type: CallTypeEnum;

  @Column({
    type: 'enum',
    enum: CallStatusEnum,
    enumName: 'call_status_enum',
  })
  status: CallStatusEnum;

  @Column({ name: 'initiated_by', type: 'uuid', nullable: false })
  initiatedBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'initiated_by' })
  initiator: User;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
