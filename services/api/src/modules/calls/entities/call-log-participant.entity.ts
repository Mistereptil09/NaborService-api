import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { CallParticipantStatusEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { CallLog } from './call-log.entity';

@Entity('call_log_participants')
export class CallLogParticipant {
  @PrimaryColumn({ name: 'call_id', type: 'uuid' })
  callId: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: CallParticipantStatusEnum,
    enumName: 'call_participant_status_enum',
  })
  status: CallParticipantStatusEnum;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date | null;

  @ManyToOne(() => CallLog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'call_id' })
  call: CallLog;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
