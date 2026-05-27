import * as fc from 'fast-check';
import { UploadPipeline } from '../../services/upload-pipeline.service';
import { Types } from 'mongoose';

jest.mock('sharp', () => {
  const fn = jest.fn().mockImplementation(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 200, height: 200 }),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mocked-webp-data')),
  }));
  return Object.assign(fn, {
    default: fn,
  });
});

describe('Feature: gridfs-media-storage, Property 5: Image Conversion to WebP', () => {
  let uploadPipeline: UploadPipeline;
  let mockGridFSService: any;

  beforeEach(() => {
    mockGridFSService = {
      upload: jest.fn().mockResolvedValue(new Types.ObjectId()),
    };
    uploadPipeline = new UploadPipeline(mockGridFSService);
  });

  it('should process image/jpeg, image/png, and image/gif and convert them to image/webp', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant('image/jpeg'), fc.constant('image/png'), fc.constant('image/gif')),
        async (mimeType) => {
          const file = {
            buffer: Buffer.from('fake-image-bytes'),
            size: 100,
            originalname: 'test.img',
            mimetype: mimeType,
          } as Express.Multer.File;

          const context = {
            ownerType: 'listing_photo' as any,
            maxSizeBytes: 1000,
            allowedMimeTypes: [mimeType],
          };

          const result = await uploadPipeline.process(file, context);
          expect(result.mimetype).toBe('image/webp');
          expect(result.widthPx).toBe(200);
          expect(result.heightPx).toBe(200);
        }
      ),
      { numRuns: 50 }
    );
  });
});
