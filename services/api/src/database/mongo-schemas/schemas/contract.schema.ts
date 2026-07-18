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

  // Catégorie au moment de la génération — permet au job de finalisation de
  // re-rendre le PDF avec les mêmes clauses sans re-requêter Postgres.
  @Prop({ type: String, default: null })
  category_name: string | null;

  @Prop({ type: String, default: null })
  template_key: string | null;
}

export const ListingSnapshotSchema =
  SchemaFactory.createForClass(ListingSnapshot);

/**
 * Signature d'une partie (eIDAS SES) — le sous-document n'existe qu'une fois
 * que la partie a signé, tous les champs de preuve sont donc requis.
 */
@Schema({ _id: false, timestamps: false })
export class PartySignature {
  @Prop({ required: true, type: String })
  canvas_b64: string;

  @Prop({ required: true, type: Date })
  totp_verified_at: Date;

  @Prop({ default: null, type: String })
  signed_ip: string | null;

  @Prop({ default: null, type: String })
  user_agent: string | null;

  @Prop({ required: true, type: Date })
  signed_at: Date;
}

export const PartySignatureSchema =
  SchemaFactory.createForClass(PartySignature);

@Schema({ _id: false, timestamps: false })
export class Signatures {
  @Prop({ type: PartySignatureSchema, default: null })
  provider: PartySignature | null;

  @Prop({ type: PartySignatureSchema, default: null })
  requester: PartySignature | null;
}

export const SignaturesSchema = SchemaFactory.createForClass(Signatures);

@Schema({ collection: 'contracts', timestamps: false })
export class Contract {
  @Prop({ required: true })
  pg_transaction_id: string;

  @Prop({ required: true, enum: ['contract', 'receipt'] })
  type: string;

  // SHA-256 du PDF ORIGINAL (non signé) — c'est ce hash que la signature
  // re-vérifie et que la page de preuve du PDF signé cite.
  @Prop({ required: true })
  sha256_hash: string;

  @Prop({ type: PdfSchema, required: true })
  pdf: Pdf;

  @Prop({ type: PartiesSchema, required: true })
  parties: Parties;

  @Prop({ type: ListingSnapshotSchema, required: true })
  listing_snapshot: ListingSnapshot;

  @Prop({
    type: SignaturesSchema,
    default: () => ({ provider: null, requester: null }),
  })
  signatures: Signatures;

  // PDF finalisé (signatures embarquées + certificat de signature), généré
  // quand la seconde partie signe.
  @Prop({ type: PdfSchema, default: null })
  signed_pdf: Pdf | null;

  @Prop({ type: String, default: null })
  signed_pdf_sha256: string | null;

  // Date de signature COMPLÈTE (les deux parties ont signé).
  @Prop({ default: null, type: Date })
  signed_at: Date | null;

  @Prop({ required: true, type: Date })
  created_at: Date;

  @Prop({ default: null, type: Date })
  anonymised_at: Date | null;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);

// Indexes
// Un contrat ET un reçu peuvent coexister pour une même transaction — l'unicité
// porte sur le couple (transaction, type). L'ancien index pg_transaction_id_1
// doit être supprimé manuellement (script db:migrate:contracts).
ContractSchema.index({ pg_transaction_id: 1, type: 1 }, { unique: true });
ContractSchema.index({ sha256_hash: 1 }, { unique: true });
ContractSchema.index({ signed_at: -1 });
ContractSchema.index({ anonymised_at: 1 });
ContractSchema.index({ 'parties.provider.pg_user_id': 1 });
ContractSchema.index({ 'parties.requester.pg_user_id': 1 });
