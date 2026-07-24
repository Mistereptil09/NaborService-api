import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EventTicketDocument = HydratedDocument<EventTicket>;

@Schema({ _id: false, timestamps: false })
export class QrPayload {
  @Prop({ required: true })
  event_id: string;

  @Prop({ required: true })
  user_id: string;

  @Prop({ required: true })
  first_name: string;

  @Prop({ default: null, type: String })
  custom_value: string | null;

  @Prop({ required: true })
  hmac_sha256: string;
}

export const QrPayloadSchema = SchemaFactory.createForClass(QrPayload);

@Schema({ collection: 'event_tickets', timestamps: false })
export class EventTicket {
  @Prop({ required: true })
  pg_event_id: string;

  @Prop({ required: true })
  pg_user_id: string;

  @Prop({ type: QrPayloadSchema, required: true })
  qr_payload: QrPayload;

  @Prop({ required: true, type: Buffer })
  qr_png: Buffer;

  @Prop({ required: true, type: Date })
  issued_at: Date;

  @Prop({ default: null, type: Date })
  scanned_at: Date | null;
}

export const EventTicketSchema = SchemaFactory.createForClass(EventTicket);

EventTicketSchema.index({ pg_event_id: 1, pg_user_id: 1 }, { unique: true });
EventTicketSchema.index({ 'qr_payload.hmac_sha256': 1 }, { unique: true });
EventTicketSchema.index({ issued_at: -1 });
