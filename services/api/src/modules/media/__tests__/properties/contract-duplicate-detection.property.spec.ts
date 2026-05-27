import * as fc from 'fast-check';
import { MediaService } from '../../services/media.service';
import { Types } from 'mongoose';
import { ConflictException } from '@nestjs/common';

describe('Feature: gridfs-media-storage, Property 13: Contract Duplicate Detection', () => {
  let mediaService: MediaService;
  let mockMediaModel: any;
  let mockListingRepo: any;
  let mockUserRepo: any;
  let mockGridFSService: any;
  let mockUploadPipeline: any;

  beforeEach(() => {
    mockMediaModel = jest.fn();
    mockMediaModel.findOne = jest.fn();

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

  it('should throw ConflictException if a contract with identical sha256_hash is already present', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 500 }),
        async (data) => {
          const buffer = Buffer.from(data);

          const file = {
            buffer,
            size: buffer.length,
            originalname: 'contract.pdf',
            mimetype: 'application/pdf',
          } as Express.Multer.File;

          mockMediaModel.findOne.mockResolvedValue({
            _id: new Types.ObjectId(),
            owner_type: 'contract',
            sha256_hash: 'some-hash',
          });

          await expect(mediaService.upload(file, 'contract', 'trans-123')).rejects.toThrow(
            ConflictException,
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});
