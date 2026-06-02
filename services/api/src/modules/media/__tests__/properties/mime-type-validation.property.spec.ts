import * as fc from 'fast-check';
import { UploadPipeline } from '../../services/upload-pipeline.service';
import { UnsupportedMediaTypeException } from '@nestjs/common';

describe('Feature: gridfs-media-storage, Property 4: MIME Type Validation', () => {
  let uploadPipeline: UploadPipeline;
  let mockGridFSService: any;

  beforeEach(() => {
    mockGridFSService = {
      upload: jest.fn(),
    };
    uploadPipeline = new UploadPipeline(mockGridFSService);
  });

  it('should accept allowed mime types and throw UnsupportedMediaTypeException for others', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // mime type
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 10,
        }), // allowed mime types list
        (mimeType, allowedTypes) => {
          const file = {
            buffer: Buffer.from('abc'),
            size: 100,
            originalname: 'test.png',
            mimetype: mimeType,
          } as Express.Multer.File;

          const context = {
            ownerType: 'listing_photo' as any,
            maxSizeBytes: 1000,
            allowedMimeTypes: allowedTypes,
          };

          const isAllowed = allowedTypes.includes(mimeType);

          if (isAllowed) {
            expect(() =>
              (uploadPipeline as any).validateFile(file, context),
            ).not.toThrow();
          } else {
            expect(() =>
              (uploadPipeline as any).validateFile(file, context),
            ).toThrow(UnsupportedMediaTypeException);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
