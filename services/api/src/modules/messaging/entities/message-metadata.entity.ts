import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ChatGroup } from './chat-group.entity';

@Entity('message_metadata')
@Index('idx_msg_group_sent', ['groupId', 'sentAt'])
@Index('idx_msg_sender', ['senderId'])
export class MessageMetadata {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'mongo_message_id', type: 'text', nullable: false })
  mongoMessageId: string;

  @Column({ name: 'group_id', type: 'uuid', nullable: false })
  groupId: string;

  @Column({ name: 'sender_id', type: 'uuid', nullable: false })
  senderId: string;

  @Column({
    name: 'sent_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  sentAt: Date;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ name: 'is_deleted', type: 'boolean', nullable: false, default: false })
  isDeleted: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'parent_message_id', type: 'uuid', nullable: true })
  parentMessageId: string | null;

  @ManyToOne(() => ChatGroup)
  @JoinColumn({ name: 'group_id' })
  group: ChatGroup;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @ManyToOne(() => MessageMetadata, { nullable: true })
  @JoinColumn({ name: 'parent_message_id' })
  parentMessage: MessageMetadata | null;
}
