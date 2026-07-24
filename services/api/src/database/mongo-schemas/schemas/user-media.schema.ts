import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserMediaDocument = HydratedDocument<UserMedia>;

@Schema({ collection: 'user_media', timestamps: false })
export class UserMedia {
  @Prop({ required: true })
  pg_user_id: string;

  @Prop({ required: true, enum: ['avatar', 'banner'] })
  type: string;

  @Prop({ required: true })
  mimetype: string;

  @Prop({ required: true })
  size_bytes: number;

  @Prop({ required: true })
  width_px: number;

  @Prop({ required: true })
  height_px: number;

  @Prop({ required: true, type: Date })
  uploaded_at: Date;

  @Prop({ default: null, type: Date })
  replaced_at: Date | null;
}

export const UserMediaSchema = SchemaFactory.createForClass(UserMedia);

UserMediaSchema.index({ pg_user_id: 1, type: 1 }, { unique: true });
UserMediaSchema.index({ uploaded_at: -1 });
