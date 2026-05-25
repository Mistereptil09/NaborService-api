import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { MessageMetadata } from './message-metadata.entity';

@Entity('message_read_receipts')
export class MessageReadReceipt {
  @PrimaryColumn({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    name: 'read_at',
    type: 'timestamptz',
    nullable: false,
    default: () => 'now()',
  })
  readAt: Date;

  @ManyToOne(() => MessageMetadata)
  @JoinColumn({ name: 'message_id' })
  message: MessageMetadata;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
