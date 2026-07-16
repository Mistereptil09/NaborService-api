import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  createBinarySizeValidator,
  createArrayLengthValidator,
  createTotalSizePreSaveHook,
} from '../validators/size-validators';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ _id: false, timestamps: false })
export class Attachment {
  @Prop({ required: true, type: Buffer })
  data: Buffer;

  @Prop({ required: true })
  mimetype: string;

  @Prop({ required: true })
  filename: string;

  @Prop({
    required: true,
    validate: createBinarySizeValidator(4718592, 'attachment'),
  })
  size_bytes: number;

  @Prop({ required: true, type: Date })
  uploaded_at: Date;
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment);

@Schema({ _id: false, timestamps: false })
export class Reaction {
  @Prop({ required: true })
  pg_user_id: string;

  @Prop({ required: true })
  emoji: string;

  @Prop({ required: true, type: Date })
  reacted_at: Date;
}

export const ReactionSchema = SchemaFactory.createForClass(Reaction);

@Schema({ collection: 'messages', timestamps: false })
export class Message {
  @Prop({ required: true })
  pg_message_id: string;

  @Prop({ required: true })
  pg_group_id: string;

  @Prop({ required: true })
  pg_sender_id: string;

  @Prop({ required: true })
  content_encrypted: string;

  @Prop({ required: true })
  iv: string;

  @Prop({ required: true })
  auth_tag: string;

  @Prop({ required: true, enum: ['text', 'image', 'file', 'voice', 'poll'] })
  type: string;

  @Prop({ type: String, default: null })
  poll_id: string | null;

  @Prop({
    type: [AttachmentSchema],
    validate: createArrayLengthValidator(3, 'attachments'),
  })
  attachments: Attachment[];

  @Prop({ type: [ReactionSchema] })
  reactions: Reaction[];

  @Prop({ required: true, type: Date })
  sent_at: Date;

  @Prop({ default: null, type: Date })
  edited_at: Date | null;

  @Prop({ default: null, type: Date })
  deleted_at: Date | null;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Pre-save hook for aggregate size safety
MessageSchema.pre(
  'save',
  createTotalSizePreSaveHook({
    binaryFields: [
      { path: 'attachments', isArray: true, sizeField: 'size_bytes' },
    ],
    maxTotalBytes: 14155776, // 13.5 MB
  }),
);

// Indexes
MessageSchema.index({ pg_message_id: 1 }, { unique: true });
MessageSchema.index({ pg_group_id: 1, sent_at: -1 });
MessageSchema.index({ pg_sender_id: 1 });
MessageSchema.index({ deleted_at: 1 });
