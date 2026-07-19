import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { createTotalSizePreSaveHook } from '../validators/size-validators';

export type EventDocumentDocument = HydratedDocument<EventDocument>;

@Schema({ _id: false, timestamps: false })
export class Cover {
  @Prop({ required: true, type: Buffer })
  data: Buffer;

  @Prop({ required: true })
  mimetype: string;

  @Prop({ required: true })
  size_bytes: number;
}

export const CoverSchema = SchemaFactory.createForClass(Cover);

@Schema({ _id: false, timestamps: false })
export class ProgrammeItem {
  @Prop({ required: true })
  time: string;

  @Prop({ required: true })
  label: string;
}

export const ProgrammeItemSchema = SchemaFactory.createForClass(ProgrammeItem);

@Schema({ _id: false, timestamps: false })
export class Location {
  @Prop({ default: null, type: String })
  address: string | null;

  @Prop({ default: null, type: String })
  geocode: string | null;
}

export const LocationSchema = SchemaFactory.createForClass(Location);

@Schema({ _id: false, timestamps: false })
export class EventAttachment {
  @Prop({ required: true, type: Buffer })
  data: Buffer;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  mimetype: string;

  @Prop({ required: true })
  size_bytes: number;

  @Prop({ required: true, type: Date })
  uploaded_at: Date;
}

export const EventAttachmentSchema =
  SchemaFactory.createForClass(EventAttachment);

@Schema({ collection: 'event_documents', timestamps: false })
export class EventDocument {
  @Prop({ required: true })
  pg_event_id: string;

  @Prop({ default: '' })
  body_html: string;

  @Prop({ type: CoverSchema, default: null })
  cover: Cover | null;

  @Prop({ type: [ProgrammeItemSchema] })
  programme: ProgrammeItem[];

  @Prop({ type: LocationSchema, required: true })
  location: Location;

  @Prop({ type: [EventAttachmentSchema] })
  attachments: EventAttachment[];

  @Prop({ required: true, type: Date })
  created_at: Date;

  @Prop({ required: true, type: Date })
  updated_at: Date;

  @Prop({ default: null, type: Date })
  anonymised_at: Date | null;
}

export const EventDocumentSchema = SchemaFactory.createForClass(EventDocument);

// Pre-save hook for aggregate size safety (cover + attachments <= 13.5 MB)
EventDocumentSchema.pre(
  'save',
  createTotalSizePreSaveHook({
    binaryFields: [
      { path: 'cover', isArray: false, sizeField: 'size_bytes' },
      { path: 'attachments', isArray: true, sizeField: 'size_bytes' },
    ],
    maxTotalBytes: 14155776, // 13.5 MB
  }),
);

// Indexes
EventDocumentSchema.index({ pg_event_id: 1 }, { unique: true });
EventDocumentSchema.index({ updated_at: -1 });
