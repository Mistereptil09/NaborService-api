import * as fc from 'fast-check';
import { UploadPipeline } from '../../services/upload-pipeline.service';
import { Types } from 'mongoose';

jest.mock('sharp', () => {
  const fn = jest.fn().mockImplementation(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 250, height: 250 }),
  }));
  return Object.assign(fn, {
    default: fn,
  });
});

describe('Feature: gridfs-media-storage, Property 6: WebP and Non-Image Passthrough', () => {
  let uploadPipeline: UploadPipeline;
  let mockGridFSService: any;

  beforeEach(() => {
    mockGridFSService = {
      upload: jest.fn().mockResolvedValue(new Types.ObjectId()),
    };
    uploadPipeline = new UploadPipeline(mockGridFSService);
  });

  it('should pass through WebP and application/pdf without modification', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant('image/webp'), fc.constant('application/pdf')),
        fc.uint8Array({ minLength: 1, maxLength: 1000 }),
        async (mimeType, data) => {
          const buffer = Buffer.from(data);
          const file = {
            buffer,
            size: buffer.length,
            originalname: mimeType === 'image/webp' ? 'test.webp' : 'test.pdf',
            mimetype: mimeType,
          } as Express.Multer.File;

          const context = {
            ownerType: mimeType === 'image/webp' ? 'listing_photo' : 'contract',
            maxSizeBytes: 2000,
            allowedMimeTypes: [mimeType],
          } as any;

          const result = await uploadPipeline.process(file, context);
          expect(result.mimetype).toBe(mimeType);

          expect(mockGridFSService.upload).toHaveBeenCalledWith(
            buffer,
            file.originalname,
            mimeType,
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});
