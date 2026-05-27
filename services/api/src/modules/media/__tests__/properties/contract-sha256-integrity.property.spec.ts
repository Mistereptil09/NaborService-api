import * as fc from 'fast-check';
import { MediaService } from '../../services/media.service';
import { Types } from 'mongoose';
import * as crypto from 'crypto';

describe('Feature: gridfs-media-storage, Property 12: Contract SHA-256 Integrity', () => {
  let mediaService: MediaService;
  let mockMediaModel: any;
  let mockListingRepo: any;
  let mockUserRepo: any;
  let mockGridFSService: any;
  let mockUploadPipeline: any;

  beforeEach(() => {
    mockMediaModel = jest.fn();
    mockMediaModel.findOne = jest.fn().mockResolvedValue(null);

    mockListingRepo = {};
    mockUserRepo = {};
    mockGridFSService = {};
    mockUploadPipeline = {
      process: jest.fn().mockImplementation((file) => ({
        gridfsFileId: new Types.ObjectId(),
        mimetype: 'application/pdf',
        sizeBytes: file.size,
        originalFilename: file.originalname,
      })),
    };

    mediaService = new MediaService(
      mockMediaModel,
      mockListingRepo,
      mockUserRepo,
      mockGridFSService,
      mockUploadPipeline,
    );
  });

  it('should compute the correct SHA-256 hash matching the buffer and store it in metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1000 }),
        async (data) => {
          const buffer = Buffer.from(data);
          const expectedHash = crypto.createHash('sha256').update(buffer).digest('hex');

          const file = {
            buffer,
            size: buffer.length,
            originalname: 'contract.pdf',
            mimetype: 'application/pdf',
          } as Express.Multer.File;

          const mockSavedDoc = {
            _id: new Types.ObjectId(),
            owner_type: 'contract',
            owner_id: 'trans-123',
            sha256_hash: expectedHash,
            save: jest.fn().mockResolvedValue(undefined),
          };

          const mockModelInstance = jest.fn().mockImplementation((fields) => {
            const doc = {
              ...fields,
              save: jest.fn().mockImplementation(function (this: any) {
                expect(this.sha256_hash).toBe(expectedHash);
                return Promise.resolve(mockSavedDoc);
              }),
            };
            return doc;
          }) as any;

          mockModelInstance.findOne = mockMediaModel.findOne;
          (mediaService as any).mediaFileModel = mockModelInstance;

          const result = await mediaService.upload(file, 'contract', 'trans-123');
          expect(result.sha256_hash).toBe(expectedHash);
        }
      ),
      { numRuns: 50 }
    );
  });
});
