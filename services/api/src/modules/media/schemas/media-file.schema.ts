import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MediaFileDocument = HydratedDocument<MediaFile>;

@Schema({ collection: 'media_files', timestamps: false })
export class MediaFile {
  @Prop({
    required: true,
    enum: [
      'user_avatar',
      'user_banner',
      'listing_photo',
      'event_cover',
      'event_attachment',
      'incident_photo',
      'message_attachment',
      'contract',
    ],
  })
  owner_type: string;

  @Prop({ required: true })
  owner_id: string; // PostgreSQL UUID of the owning entity

  @Prop({ required: true, type: Types.ObjectId })
  gridfs_file_id: Types.ObjectId;

  @Prop({ required: true, maxlength: 255 })
  mimetype: string;

  @Prop({ required: true, min: 1 })
  size_bytes: number;

  @Prop({ required: true, maxlength: 255 })
  original_filename: string;

  @Prop({ required: true, type: Date })
  uploaded_at: Date;

  @Prop({ type: Number, default: null, min: 1 })
  width_px: number | null;

  @Prop({ type: Number, default: null, min: 1 })
  height_px: number | null;

  @Prop({ type: Number, default: null, min: 0 })
  duration_seconds: number | null;

  @Prop({ type: Number, default: null, min: 0 })
  order: number | null;

  @Prop({ type: String, default: null, maxlength: 280 })
  caption: string | null;

  @Prop({ type: String, default: null })
  sha256_hash: string | null;

  @Prop({
    type: String,
    default: null,
    enum: ['contract', 'receipt', 'contract_signed', null],
  })
  contract_type: string | null;

  @Prop({ type: Date, default: null })
  taken_at: Date | null;

  @Prop({ type: Date, default: null })
  synced_at: Date | null;
}

export const MediaFileSchema = SchemaFactory.createForClass(MediaFile);

MediaFileSchema.index({ owner_type: 1, owner_id: 1 });
MediaFileSchema.index({ gridfs_file_id: 1 }, { unique: true });
MediaFileSchema.index({ sha256_hash: 1 }, { sparse: true });
