import * as fc from 'fast-check';
import { UploadPipeline } from '../../services/upload-pipeline.service';
import { PayloadTooLargeException } from '@nestjs/common';

describe('Feature: gridfs-media-storage, Property 3: File Size Validation', () => {
  let uploadPipeline: UploadPipeline;
  let mockGridFSService: any;

  beforeEach(() => {
    mockGridFSService = {
      upload: jest.fn(),
    };
    uploadPipeline = new UploadPipeline(mockGridFSService);
  });

  it('should accept file sizes within context limits and throw PayloadTooLargeException if exceeded', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000 }),
        fc.integer({ min: 1, max: 50_000_000 }),
        (fileSize, maxLimit) => {
          const file = {
            buffer: Buffer.from('abc'),
            size: fileSize,
            originalname: 'test.png',
            mimetype: 'image/png',
          } as Express.Multer.File;

          const context = {
            ownerType: 'listing_photo' as any,
            maxSizeBytes: maxLimit,
            allowedMimeTypes: ['image/png'],
          };

          if (fileSize > maxLimit) {
            expect(() => (uploadPipeline as any).validateFile(file, context)).toThrow(
              PayloadTooLargeException,
            );
          } else {
            expect(() => (uploadPipeline as any).validateFile(file, context)).not.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
