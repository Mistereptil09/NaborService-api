import * as fc from 'fast-check';
import { MediaService } from '../../services/media.service';
import { Types } from 'mongoose';
import { PayloadTooLargeException } from '@nestjs/common';

describe('Feature: gridfs-media-storage, Property 15: Event Aggregate Size Constraint', () => {
  let mediaService: MediaService;
  let mockMediaModel: any;
  let mockListingRepo: any;
  let mockUserRepo: any;
  let mockGridFSService: any;
  let mockUploadPipeline: any;

  beforeEach(() => {
    mockMediaModel = jest.fn();
    mockMediaModel.find = jest.fn();

    mockListingRepo = {};
    mockUserRepo = {};
    mockGridFSService = {};
    mockUploadPipeline = {};

    mediaService = new MediaService(
      mockMediaModel,
      mockListingRepo,
      mockUserRepo,
      mockGridFSService,
      mockUploadPipeline,
    );
  });

  it('should reject uploads if the combined size of event media exceeds 13.5MB', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20_000_000 }),
        fc.integer({ min: 1, max: 20_000_000 }),
        async (existingSize, fileSize) => {
          const file = {
            buffer: Buffer.alloc(fileSize),
            size: fileSize,
            originalname: 'cover.png',
            mimetype: 'image/png',
          } as Express.Multer.File;

          mockMediaModel.find.mockResolvedValue([
            {
              size_bytes: existingSize,
            }
          ]);

          const totalLimit = 14155776;

          if (existingSize + fileSize > totalLimit) {
            await expect(mediaService.upload(file, 'event_cover', 'event-123')).rejects.toThrow(
              PayloadTooLargeException,
            );
          } else {
            mockUploadPipeline.process = jest.fn().mockResolvedValue({
              gridfsFileId: new Types.ObjectId(),
              mimetype: 'image/webp',
              sizeBytes: fileSize,
              originalFilename: 'cover.png',
            });
            const mockSavedDoc = {
              _id: new Types.ObjectId(),
              save: jest.fn().mockResolvedValue(undefined),
            };
            const mockModelInstance = jest.fn().mockImplementation(() => ({
              save: jest.fn().mockResolvedValue(mockSavedDoc),
            })) as any;
            mockModelInstance.find = mockMediaModel.find;
            mockModelInstance.findOne = jest.fn().mockResolvedValue(null);
            mockModelInstance.deleteOne = jest.fn().mockResolvedValue(undefined);
            (mediaService as any).mediaFileModel = mockModelInstance;

            await expect(mediaService.upload(file, 'event_cover', 'event-123')).resolves.toBeDefined();
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
