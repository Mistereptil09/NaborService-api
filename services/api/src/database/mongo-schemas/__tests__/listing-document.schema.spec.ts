import * as mongoose from 'mongoose';
import { ListingDocumentSchema } from '../schemas/listing-document.schema';
import { createTotalSizePreSaveHook } from '../validators/size-validators';

describe('ListingDocument Schema', () => {
  let ListingDocumentModel: mongoose.Model<any>;

  beforeAll(() => {
    ListingDocumentModel =
      mongoose.models.ListingDocument ||
      mongoose.model('ListingDocument', ListingDocumentSchema);
  });

  it('should have the correct collection name', () => {
    expect(ListingDocumentSchema.options.collection).toBe('listing_documents');
  });

  it('should have the correct indexes defined', () => {
    const indexes = ListingDocumentSchema.indexes();

    const pgListingIdx = indexes.find((idx) => idx[0].pg_listing_id === 1);
    expect(pgListingIdx).toBeDefined();
    expect(pgListingIdx?.[1]?.unique).toBe(true);

    const tagsIdx = indexes.find((idx) => idx[0].tags === 1);
    expect(tagsIdx).toBeDefined();

    const updatedIdx = indexes.find((idx) => idx[0].updated_at === -1);
    expect(updatedIdx).toBeDefined();
  });

  it('should validate successfully for a valid listing document', () => {
    const doc = new ListingDocumentModel({
      pg_listing_id: 'lst_123',
      body_html: '<p>Beautiful listing</p>',
      photos: [
        {
          data: Buffer.from('photo'),
          mimetype: 'image/jpeg',
          size_bytes: 1572864, // exactly 1.5 MB
          order: 1,
          uploaded_at: new Date(),
        },
      ],
      tags: ['apartment', 'clean'],
      created_at: new Date(),
      updated_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('should accept a photo of any size on database schema level (validation delegated to service)', () => {
    const doc = new ListingDocumentModel({
      pg_listing_id: 'lst_123',
      body_html: '<p>Beautiful listing</p>',
      photos: [
        {
          mimetype: 'image/jpeg',
          size_bytes: 1572865, // 1.5 MB + 1 byte
          order: 1,
          uploaded_at: new Date(),
        },
      ],
      tags: ['apartment'],
      created_at: new Date(),
      updated_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('should reject photos array exceeding length 8', () => {
    const photosList = Array.from({ length: 9 }).map((_, i) => ({
      data: Buffer.from('p'),
      mimetype: 'image/jpeg',
      size_bytes: 100,
      order: i,
      uploaded_at: new Date(),
    }));

    const doc = new ListingDocumentModel({
      pg_listing_id: 'lst_123',
      body_html: '<p>Beautiful listing</p>',
      photos: photosList,
      tags: ['apartment'],
      created_at: new Date(),
      updated_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.photos).toBeDefined();
    expect(err?.errors.photos.message).toBe(
      'photos exceeds maximum length of 8',
    );
  });

  describe('Pre-save hook - aggregate size limit', () => {
    const hook = createTotalSizePreSaveHook({
      binaryFields: [
        { path: 'photos', isArray: true, sizeField: 'size_bytes' },
      ],
      maxTotalBytes: 12582912, // 12 MB
    });

    it('should pass if the total size of photos is at or below 12 MB', () => {
      const mockDoc = {
        get: (path: string) => {
          if (path === 'photos')
            return [{ size_bytes: 6000000 }, { size_bytes: 6582912 }];
          return null;
        },
      };

      let error: any;
      hook.call(mockDoc, (err: any) => {
        error = err;
      });
      expect(error).toBeUndefined();
    });

    it('should fail if the total size of photos exceeds 12 MB', () => {
      const mockDoc = {
        get: (path: string) => {
          if (path === 'photos')
            return [{ size_bytes: 6000000 }, { size_bytes: 6582913 }]; // 1 byte over
          return null;
        },
      };

      let error: any;
      hook.call(mockDoc, (err: any) => {
        error = err;
      });
      expect(error).toBeDefined();
      expect(error.errors.total_size.message).toBe(
        'Total binary size (12582913 bytes) exceeds maximum of 12582912 bytes',
      );
    });
  });
});
