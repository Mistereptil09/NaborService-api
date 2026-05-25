import * as fc from 'fast-check';
import * as mongoose from 'mongoose';
import { UserMediaSchema } from '../../schemas/user-media.schema';
import { ListingDocumentSchema } from '../../schemas/listing-document.schema';
import { ContractSchema } from '../../schemas/contract.schema';
import { MessageSchema } from '../../schemas/message.schema';
import { EventDocumentSchema } from '../../schemas/event-document.schema';
import { EventTicketSchema } from '../../schemas/event-ticket.schema';
import { IncidentDocumentSchema } from '../../schemas/incident-document.schema';

describe('Property 1: Valid document acceptance', () => {
  let UserMediaModel: mongoose.Model<any>;
  let ListingDocumentModel: mongoose.Model<any>;
  let ContractModel: mongoose.Model<any>;
  let MessageModel: mongoose.Model<any>;
  let EventDocumentModel: mongoose.Model<any>;
  let EventTicketModel: mongoose.Model<any>;
  let IncidentDocumentModel: mongoose.Model<any>;

  beforeAll(() => {
    UserMediaModel = mongoose.models.UserMedia || mongoose.model('UserMedia', UserMediaSchema);
    ListingDocumentModel =
      mongoose.models.ListingDocument || mongoose.model('ListingDocument', ListingDocumentSchema);
    ContractModel = mongoose.models.Contract || mongoose.model('Contract', ContractSchema);
    MessageModel = mongoose.models.Message || mongoose.model('Message', MessageSchema);
    EventDocumentModel =
      mongoose.models.EventDocument || mongoose.model('EventDocument', EventDocumentSchema);
    EventTicketModel = mongoose.models.EventTicket || mongoose.model('EventTicket', EventTicketSchema);
    IncidentDocumentModel =
      mongoose.models.IncidentDocument || mongoose.model('IncidentDocument', IncidentDocumentSchema);
  });

  it('should accept valid UserMedia documents', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant('avatar'), fc.constant('banner')),
        fc.string({ minLength: 1 }),
        (type, pg_user_id) => {
          const limit = type === 'avatar' ? 2097152 : 4194304;
          const doc = new UserMediaModel({
            pg_user_id,
            type,
            data: Buffer.from('abc'),
            mimetype: 'image/png',
            size_bytes: limit - 100,
            width_px: 200,
            height_px: 200,
            uploaded_at: new Date(),
          });
          expect(doc.validateSync()).toBeUndefined();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('should accept valid ListingDocument documents', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (pg_listing_id, body_html) => {
        const doc = new ListingDocumentModel({
          pg_listing_id,
          body_html,
          photos: [
            {
              data: Buffer.from('img'),
              mimetype: 'image/png',
              size_bytes: 1000,
              order: 1,
              uploaded_at: new Date(),
            },
          ],
          tags: ['test'],
          created_at: new Date(),
          updated_at: new Date(),
        });
        expect(doc.validateSync()).toBeUndefined();
      }),
      { numRuns: 50 },
    );
  });

  it('should accept valid Contract documents', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.oneof(fc.constant('contract'), fc.constant('receipt')),
        fc.string({ minLength: 1 }),
        (pg_transaction_id, type, sha256_hash) => {
          const doc = new ContractModel({
            pg_transaction_id,
            type,
            sha256_hash,
            pdf: {
              data: Buffer.from('pdf'),
              mimetype: 'application/pdf',
              size_bytes: 1234,
            },
            parties: {
              provider: {
                pg_user_id: 'p1',
                full_name: 'P1 Name',
                email: 'p1@test.com',
              },
              requester: {
                pg_user_id: 'r1',
                full_name: 'R1 Name',
                email: 'r1@test.com',
              },
            },
            listing_snapshot: {
              title: 'Offer title',
              price_cents: 100,
              listing_type: 'offer',
              neighbourhood_name: 'Hood',
            },
            signature: {
              canvas_b64: null,
              totp_verified_at: new Date(),
              signed_ip: null,
              user_agent: null,
            },
            signed_at: null,
            created_at: new Date(),
            anonymised_at: null,
          });
          expect(doc.validateSync()).toBeUndefined();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('should accept valid Message documents', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.oneof(fc.constant('text'), fc.constant('image'), fc.constant('file'), fc.constant('voice')),
        (pg_message_id, pg_group_id, pg_sender_id, type) => {
          const doc = new MessageModel({
            pg_message_id,
            pg_group_id,
            pg_sender_id,
            content_encrypted: 'abc',
            iv: 'iv',
            auth_tag: 'tag',
            type,
            attachments: [],
            reactions: [],
            sent_at: new Date(),
          });
          expect(doc.validateSync()).toBeUndefined();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('should accept valid EventDocument documents', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (pg_event_id, body_html) => {
        const doc = new EventDocumentModel({
          pg_event_id,
          body_html,
          cover: null,
          programme: [],
          location: { address: null, geocode: null },
          attachments: [],
          created_at: new Date(),
          updated_at: new Date(),
        });
        expect(doc.validateSync()).toBeUndefined();
      }),
      { numRuns: 50 },
    );
  });

  it('should accept valid EventTicket documents', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (pg_event_id, pg_user_id) => {
        const doc = new EventTicketModel({
          pg_event_id,
          pg_user_id,
          qr_payload: {
            event_id: pg_event_id,
            user_id: pg_user_id,
            first_name: 'Name',
            custom_value: null,
            hmac_sha256: 'hmac',
          },
          qr_png: Buffer.from('png'),
          issued_at: new Date(),
        });
        expect(doc.validateSync()).toBeUndefined();
      }),
      { numRuns: 50 },
    );
  });

  it('should accept valid IncidentDocument documents', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (pg_incident_id, body) => {
        const doc = new IncidentDocumentModel({
          pg_incident_id,
          body,
          photos: [],
          created_at: new Date(),
          updated_at: new Date(),
          synced_at: new Date(),
        });
        expect(doc.validateSync()).toBeUndefined();
      }),
      { numRuns: 50 },
    );
  });
});
