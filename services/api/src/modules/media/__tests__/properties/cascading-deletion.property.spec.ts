import * as fc from 'fast-check';
import { MediaService } from '../../services/media.service';
import { Types } from 'mongoose';

describe('Feature: gridfs-media-storage, Property 17: Cascading Deletion', () => {
  let mediaService: MediaService;
  let mockMediaModel: any;
  let mockListingRepo: any;
  let mockUserRepo: any;
  let mockGridFSService: any;
  let mockUploadPipeline: any;

  beforeEach(() => {
    mockMediaModel = jest.fn();
    mockMediaModel.findById = jest.fn();
    mockMediaModel.deleteOne = jest.fn();

    mockListingRepo = {};
    mockUserRepo = {};
    mockGridFSService = {
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockUploadPipeline = {};

    mediaService = new MediaService(
      mockMediaModel,
      mockListingRepo,
      mockUserRepo,
      mockGridFSService,
      mockUploadPipeline,
    );
  });

  it('should call GridFSService.delete with the referenced gridfs_file_id when a MediaFile is deleted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const mediaId = new Types.ObjectId();
          const gridfsFileId = new Types.ObjectId();

          const mockDoc = {
            _id: mediaId,
            gridfs_file_id: gridfsFileId,
            owner_type: 'contract',
            owner_id: 'trans-123',
            toObject: jest.fn().mockReturnValue({ _id: mediaId, gridfs_file_id: gridfsFileId }),
          };

          mockMediaModel.findById.mockResolvedValue(mockDoc);
          mockMediaModel.deleteOne.mockResolvedValue(undefined);

          await mediaService.delete(mediaId.toString());

          expect(mockGridFSService.delete).toHaveBeenCalledWith(gridfsFileId);
        }
      ),
      { numRuns: 50 }
    );
  });
});
