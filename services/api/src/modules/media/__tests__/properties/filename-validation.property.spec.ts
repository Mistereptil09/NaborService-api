import * as fc from 'fast-check';
import { UploadPipeline } from '../../services/upload-pipeline.service';
import { BadRequestException } from '@nestjs/common';

describe('Feature: gridfs-media-storage, Property 14: Filename Validation and Preservation', () => {
  let uploadPipeline: UploadPipeline;
  let mockGridFSService: any;

  beforeEach(() => {
    mockGridFSService = {};
    uploadPipeline = new UploadPipeline(mockGridFSService);
  });

  it('should accept valid filenames <= 255 chars and reject empty or filenames > 255 chars', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (filename) => {
          const file = {
            buffer: Buffer.from('abc'),
            size: 100,
            originalname: filename,
            mimetype: 'image/png',
          } as Express.Multer.File;

          const context = {
            ownerType: 'listing_photo' as any,
            maxSizeBytes: 1000,
            allowedMimeTypes: ['image/png'],
          };

          const isValid = filename.length > 0 && filename.length <= 255;

          if (isValid) {
            expect(() => (uploadPipeline as any).validateFile(file, context)).not.toThrow();
          } else {
            expect(() => (uploadPipeline as any).validateFile(file, context)).toThrow(
              BadRequestException,
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
