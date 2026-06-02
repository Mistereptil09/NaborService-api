import * as mongoose from 'mongoose';
import { EventDocumentSchema } from '../schemas/event-document.schema';
import { createTotalSizePreSaveHook } from '../validators/size-validators';

describe('EventDocument Schema', () => {
  let EventDocumentModel: mongoose.Model<any>;

  beforeAll(() => {
    EventDocumentModel =
      mongoose.models.EventDocument ||
      mongoose.model('EventDocument', EventDocumentSchema);
  });

  it('should have the correct collection name', () => {
    expect(EventDocumentSchema.options.collection).toBe('event_documents');
  });

  it('should have the correct indexes defined', () => {
    const indexes = EventDocumentSchema.indexes();

    const pgEventIdx = indexes.find((idx) => idx[0].pg_event_id === 1);
    expect(pgEventIdx).toBeDefined();
    expect(pgEventIdx?.[1]?.unique).toBe(true);

    const updatedIdx = indexes.find((idx) => idx[0].updated_at === -1);
    expect(updatedIdx).toBeDefined();
  });

  it('should validate successfully for a valid event document', () => {
    const doc = new EventDocumentModel({
      pg_event_id: 'evt_123',
      body_html: '<h1>Event Title</h1>',
      cover: {
        data: Buffer.from('cover'),
        mimetype: 'image/jpeg',
        size_bytes: 1000000,
      },
      programme: [
        {
          time: '18:00',
          label: 'Welcome Speech',
        },
      ],
      location: {
        address: '123 Main St',
        geocode: '45.123, -73.456',
      },
      attachments: [
        {
          data: Buffer.from('attachment'),
          name: 'flyer.pdf',
          mimetype: 'application/pdf',
          size_bytes: 200000,
          uploaded_at: new Date(),
        },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  describe('Pre-save hook - aggregate size limit', () => {
    const hook = createTotalSizePreSaveHook({
      binaryFields: [
        { path: 'cover', isArray: false, sizeField: 'size_bytes' },
        { path: 'attachments', isArray: true, sizeField: 'size_bytes' },
      ],
      maxTotalBytes: 14155776, // 13.5 MB
    });

    it('should pass if the cover + attachments size is at or below 13.5 MB', () => {
      const mockDoc = {
        get: (path: string) => {
          if (path === 'cover') return { size_bytes: 5000000 };
          if (path === 'attachments')
            return [{ size_bytes: 4000000 }, { size_bytes: 5155776 }];
          return null;
        },
      };

      let error: any;
      hook.call(mockDoc, (err: any) => {
        error = err;
      });
      expect(error).toBeUndefined();
    });

    it('should fail if the cover + attachments size exceeds 13.5 MB', () => {
      const mockDoc = {
        get: (path: string) => {
          if (path === 'cover') return { size_bytes: 5000000 };
          if (path === 'attachments')
            return [{ size_bytes: 4000000 }, { size_bytes: 5155777 }]; // 1 byte over
          return null;
        },
      };

      let error: any;
      hook.call(mockDoc, (err: any) => {
        error = err;
      });
      expect(error).toBeDefined();
      expect(error.errors.total_size.message).toBe(
        'Total binary size (14155777 bytes) exceeds maximum of 14155776 bytes',
      );
    });
  });
});
