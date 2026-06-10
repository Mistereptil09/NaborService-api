import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContractDocument = HydratedDocument<Contract>;

@Schema({ _id: false, timestamps: false })
export class Pdf {
  @Prop({ required: true })
  gridfs_file_id: string;

  @Prop({ required: true })
  mimetype: string;

  @Prop({ required: true })
  size_bytes: number;
}

export const PdfSchema = SchemaFactory.createForClass(Pdf);

@Schema({ _id: false, timestamps: false })
export class Party {
  @Prop({ required: true })
  pg_user_id: string;

  @Prop({ required: true })
  full_name: string;

  @Prop({ required: true })
  email: string;
}

export const PartySchema = SchemaFactory.createForClass(Party);

@Schema({ _id: false, timestamps: false })
export class Parties {
  @Prop({ type: PartySchema, required: true })
  provider: Party;

  @Prop({ type: PartySchema, required: true })
  requester: Party;
}

export const PartiesSchema = SchemaFactory.createForClass(Parties);

@Schema({ _id: false, timestamps: false })
export class ListingSnapshot {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  price_cents: number;

  @Prop({ required: true, enum: ['offer', 'request'] })
  listing_type: string;

  @Prop({ required: true })
  neighbourhood_name: string;
}

export const ListingSnapshotSchema =
  SchemaFactory.createForClass(ListingSnapshot);

@Schema({ _id: false, timestamps: false })
export class Signature {
  @Prop({ default: null, type: String })
  canvas_b64: string | null;

  @Prop({ required: true, type: Date })
  totp_verified_at: Date;

  @Prop({ default: null, type: String })
  signed_ip: string | null;

  @Prop({ default: null, type: String })
  user_agent: string | null;
}

export const SignatureSchema = SchemaFactory.createForClass(Signature);

@Schema({ collection: 'contracts', timestamps: false })
export class Contract {
  @Prop({ required: true })
  pg_transaction_id: string;

  @Prop({ required: true, enum: ['contract', 'receipt'] })
  type: string;

  @Prop({ required: true })
  sha256_hash: string;

  @Prop({ type: PdfSchema, required: true })
  pdf: Pdf;

  @Prop({ type: PartiesSchema, required: true })
  parties: Parties;

  @Prop({ type: ListingSnapshotSchema, required: true })
  listing_snapshot: ListingSnapshot;

  @Prop({ type: SignatureSchema, required: true })
  signature: Signature;

  @Prop({ default: null, type: Date })
  signed_at: Date | null;

  @Prop({ required: true, type: Date })
  created_at: Date;

  @Prop({ default: null, type: Date })
  anonymised_at: Date | null;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);

// Indexes
ContractSchema.index({ pg_transaction_id: 1 }, { unique: true });
ContractSchema.index({ sha256_hash: 1 }, { unique: true });
ContractSchema.index({ signed_at: -1 });
ContractSchema.index({ anonymised_at: 1 });
