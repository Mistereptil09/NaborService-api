import * as fc from 'fast-check';
import { MediaService } from '../../services/media.service';
import { Types } from 'mongoose';
import { User } from '../../../users/entities/user.entity';

describe('Feature: gridfs-media-storage, Property 11: User Media Singleton Invariant', () => {
  let mediaService: MediaService;
  let mockMediaModel: any;
  let mockListingRepo: any;
  let mockUserRepo: any;
  let mockGridFSService: any;
  let mockUploadPipeline: any;

  beforeEach(() => {
    mockMediaModel = jest.fn();
    mockMediaModel.findOne = jest.fn();
    mockMediaModel.findById = jest.fn();
    mockMediaModel.deleteOne = jest.fn();
    mockMediaModel.countDocuments = jest.fn();

    mockListingRepo = {};
    mockUserRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    mockGridFSService = { delete: jest.fn().mockResolvedValue(undefined) };
    mockUploadPipeline = {
      process: jest.fn().mockResolvedValue({
        gridfsFileId: new Types.ObjectId(),
        mimetype: 'image/webp',
        sizeBytes: 1234,
        originalFilename: 'avatar.png',
      }),
    };

    mediaService = new MediaService(
      mockMediaModel,
      mockListingRepo,
      mockUserRepo,
      mockGridFSService,
      mockUploadPipeline,
    );
  });

  it('should delete existing user_avatar/user_banner before saving a new one, keeping at most one active singleton', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant('user_avatar'), fc.constant('user_banner')),
        async (ownerType) => {
          const userId = 'user-uuid-123';
          const mockUser = new User();
          mockUser.id = userId;
          mockUserRepo.findOne.mockResolvedValue(mockUser);

          const existingMedia = {
            _id: new Types.ObjectId(),
            owner_type: ownerType,
            owner_id: userId,
            gridfs_file_id: new Types.ObjectId(),
          };

          mockMediaModel.findOne.mockResolvedValue(existingMedia);
          mockMediaModel.findById.mockResolvedValue(existingMedia);
          mockMediaModel.deleteOne.mockResolvedValue(undefined);

          const mockSavedDoc = {
            _id: new Types.ObjectId(),
            owner_type: ownerType,
            owner_id: userId,
            save: jest.fn().mockResolvedValue(this),
          };
          (mediaService as any).mediaFileModel = jest.fn().mockImplementation(() => ({
            save: jest.fn().mockResolvedValue(mockSavedDoc),
          })) as any;
          Object.assign((mediaService as any).mediaFileModel, mockMediaModel);

          const file = {
            buffer: Buffer.from('abc'),
            size: 100,
            originalname: 'avatar.png',
            mimetype: 'image/png',
          } as Express.Multer.File;

          await mediaService.upload(file, ownerType as any, userId);

          expect(mockGridFSService.delete).toHaveBeenCalledWith(existingMedia.gridfs_file_id);
          expect(mockMediaModel.deleteOne).toHaveBeenCalledWith({ _id: existingMedia._id });
        }
      ),
      { numRuns: 50 }
    );
  });
});
