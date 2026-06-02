import * as fc from 'fast-check';
import * as mongoose from 'mongoose';
import { ListingDocumentSchema } from '../../schemas/listing-document.schema';
import { MessageSchema } from '../../schemas/message.schema';

describe('Property 4: Per-item binary size enforcement', () => {
  let ListingDocumentModel: mongoose.Model<any>;
  let MessageModel: mongoose.Model<any>;

  beforeAll(() => {
    ListingDocumentModel =
      mongoose.models.ListingDocument ||
      mongoose.model('ListingDocument', ListingDocumentSchema);
    MessageModel =
      mongoose.models.Message || mongoose.model('Message', MessageSchema);
  });

  it('should accept size_bytes of any size on ListingDocument schema level (validation delegated to service)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_000_000 }), (size_bytes) => {
        const doc = new ListingDocumentModel({
          pg_listing_id: 'lst_123',
          body_html: '<p>test</p>',
          photos: [
            {
              mimetype: 'image/jpeg',
              size_bytes,
              order: 1,
              uploaded_at: new Date(),
            },
          ],
          tags: [],
          created_at: new Date(),
          updated_at: new Date(),
        });

        const err = doc.validateSync();
        // Validation should pass since database-level photo size checks are removed and delegated to NestJS services
        expect(err).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('should enforce per-attachment size limit (4.5 MB) on Message', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 8_000_000 }), (size_bytes) => {
        const doc = new MessageModel({
          pg_message_id: 'msg_123',
          pg_group_id: 'grp_123',
          pg_sender_id: 'usr_123',
          content_encrypted: 'enc',
          iv: 'iv',
          auth_tag: 'tag',
          type: 'file',
          attachments: [
            {
              data: Buffer.from('a'),
              mimetype: 'text/plain',
              filename: 'test.txt',
              size_bytes,
              uploaded_at: new Date(),
            },
          ],
          reactions: [],
          sent_at: new Date(),
        });

        const err = doc.validateSync();
        const limit = 4718592; // 4.5 MB

        if (size_bytes <= limit) {
          expect(err).toBeUndefined();
        } else {
          expect(err).toBeDefined();
          expect(err?.errors['attachments.0.size_bytes']).toBeDefined();
          expect(err?.errors['attachments.0.size_bytes'].message).toBe(
            `size_bytes exceeds maximum of ${limit} bytes for attachment`,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});
