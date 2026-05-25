import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IncidentDocumentDocument = HydratedDocument<IncidentDocument>;

@Schema({ _id: false, timestamps: false })
export class IncidentPhoto {
  @Prop({ required: true, type: Buffer })
  data: Buffer;

  @Prop({ required: true })
  mimetype: string;

  @Prop({ required: true })
  size_bytes: number;

  @Prop({ required: true, type: Date })
  taken_at: Date;

  @Prop({ required: true, type: Date })
  synced_at: Date;
}

export const IncidentPhotoSchema = SchemaFactory.createForClass(IncidentPhoto);

@Schema({ collection: 'incident_documents', timestamps: false })
export class IncidentDocument {
  @Prop({ required: true })
  pg_incident_id: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: [IncidentPhotoSchema] })
  photos: IncidentPhoto[];

  @Prop({ default: null, type: String })
  location_hint: string | null;

  @Prop({ required: true, type: Date })
  created_at: Date;

  @Prop({ required: true, type: Date })
  updated_at: Date;

  @Prop({ required: true, type: Date })
  synced_at: Date;
}

export const IncidentDocumentSchema = SchemaFactory.createForClass(IncidentDocument);

// Indexes
IncidentDocumentSchema.index({ pg_incident_id: 1 }, { unique: true });
IncidentDocumentSchema.index({ synced_at: -1 });
IncidentDocumentSchema.index({ updated_at: -1 });
