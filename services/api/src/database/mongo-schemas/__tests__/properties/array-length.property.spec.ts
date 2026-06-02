import * as fc from 'fast-check';
import * as mongoose from 'mongoose';
import { ListingDocumentSchema } from '../../schemas/listing-document.schema';
import { MessageSchema } from '../../schemas/message.schema';

describe('Property 3: Array length enforcement', () => {
  let ListingDocumentModel: mongoose.Model<any>;
  let MessageModel: mongoose.Model<any>;

  beforeAll(() => {
    ListingDocumentModel =
      mongoose.models.ListingDocument ||
      mongoose.model('ListingDocument', ListingDocumentSchema);
    MessageModel =
      mongoose.models.Message || mongoose.model('Message', MessageSchema);
  });

  it('should enforce photos array limit (max 8) on ListingDocument', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (length) => {
        const photosList = Array.from({ length }).map((_, i) => ({
          data: Buffer.from('p'),
          mimetype: 'image/jpeg',
          size_bytes: 100,
          order: i,
          uploaded_at: new Date(),
        }));

        const doc = new ListingDocumentModel({
          pg_listing_id: 'lst_123',
          body_html: '<p>test</p>',
          photos: photosList,
          tags: [],
          created_at: new Date(),
          updated_at: new Date(),
        });

        const err = doc.validateSync();

        if (length <= 8) {
          expect(err).toBeUndefined();
        } else {
          expect(err).toBeDefined();
          expect(err?.errors.photos).toBeDefined();
          expect(err?.errors.photos.message).toBe(
            'photos exceeds maximum length of 8',
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should enforce attachments array limit (max 3) on Message', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), (length) => {
        const attachmentsList = Array.from({ length }).map((_, i) => ({
          data: Buffer.from('a'),
          mimetype: 'text/plain',
          filename: 'test.txt',
          size_bytes: 100,
          uploaded_at: new Date(),
        }));

        const doc = new MessageModel({
          pg_message_id: 'msg_123',
          pg_group_id: 'grp_123',
          pg_sender_id: 'usr_123',
          content_encrypted: 'enc',
          iv: 'iv',
          auth_tag: 'tag',
          type: 'file',
          attachments: attachmentsList,
          reactions: [],
          sent_at: new Date(),
        });

        const err = doc.validateSync();

        if (length <= 3) {
          expect(err).toBeUndefined();
        } else {
          expect(err).toBeDefined();
          expect(err?.errors.attachments).toBeDefined();
          expect(err?.errors.attachments.message).toBe(
            'attachments exceeds maximum length of 3',
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});
