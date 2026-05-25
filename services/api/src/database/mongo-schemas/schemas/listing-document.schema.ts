import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  createBinarySizeValidator,
  createArrayLengthValidator,
  createTotalSizePreSaveHook,
} from '../validators/size-validators';

export type ListingDocumentDocument = HydratedDocument<ListingDocument>;

@Schema({ _id: false, timestamps: false })
export class Photo {
  @Prop({ required: true, type: Buffer })
  data: Buffer;

  @Prop({ required: true })
  mimetype: string;

  @Prop({ default: null, type: String })
  caption: string | null;

  @Prop({ required: true, validate: createBinarySizeValidator(1572864, 'photo') })
  size_bytes: number;

  @Prop({ required: true })
  order: number;

  @Prop({ required: true, type: Date })
  uploaded_at: Date;
}

export const PhotoSchema = SchemaFactory.createForClass(Photo);

@Schema({ collection: 'listing_documents', timestamps: false })
export class ListingDocument {
  @Prop({ required: true })
  pg_listing_id: string;

  @Prop({ required: true })
  body_html: string;

  @Prop({
    type: [PhotoSchema],
    validate: createArrayLengthValidator(8, 'photos'),
  })
  photos: Photo[];

  @Prop({ type: [String] })
  tags: string[];

  @Prop({ required: true, type: Date })
  created_at: Date;

  @Prop({ required: true, type: Date })
  updated_at: Date;

  @Prop({ default: null, type: Date })
  anonymised_at: Date | null;
}

export const ListingDocumentSchema = SchemaFactory.createForClass(ListingDocument);

// Pre-save hook for aggregate size safety
ListingDocumentSchema.pre(
  'save',
  createTotalSizePreSaveHook({
    binaryFields: [{ path: 'photos', isArray: true, sizeField: 'size_bytes' }],
    maxTotalBytes: 12582912, // 12 MB
  }),
);

// Indexes
ListingDocumentSchema.index({ pg_listing_id: 1 }, { unique: true });
ListingDocumentSchema.index({ tags: 1 });
ListingDocumentSchema.index({ updated_at: -1 });
