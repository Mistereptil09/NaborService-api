import * as fc from 'fast-check';
import { MediaService } from '../../services/media.service';
import { Types } from 'mongoose';

describe('Feature: gridfs-media-storage, Property 9: Listing Photo Order Contiguity After Deletion', () => {
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
    mockMediaModel.find = jest.fn();

    mockListingRepo = {};
    mockUserRepo = {};
    mockGridFSService = { delete: jest.fn().mockResolvedValue(undefined) };
    mockUploadPipeline = {};

    mediaService = new MediaService(
      mockMediaModel,
      mockListingRepo,
      mockUserRepo,
      mockGridFSService,
      mockUploadPipeline,
    );
  });

  it('should recalculate contiguous orders from 0 to N-2 after a photo deletion', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 8 }),
        async (n) => {
          const listingId = 'listing-uuid-123';
          const deletedPhotoId = new Types.ObjectId();
          const targetIndex = Math.floor(Math.random() * n);

          const photos: any[] = [];
          for (let i = 0; i < n; i++) {
            const id = i === targetIndex ? deletedPhotoId : new Types.ObjectId();
            photos.push({
              _id: id,
              owner_type: 'listing_photo',
              owner_id: listingId,
              gridfs_file_id: new Types.ObjectId(),
              order: i,
              save: jest.fn().mockResolvedValue(undefined),
              toObject: jest.fn().mockReturnValue({ _id: id, order: i }),
            });
          }

          const deletedPhoto = photos[targetIndex];
          mockMediaModel.findById.mockResolvedValue(deletedPhoto);
          mockMediaModel.deleteOne.mockResolvedValue(undefined);

          const remainingPhotos = photos.filter((p) => p._id !== deletedPhotoId);
          mockMediaModel.find.mockResolvedValue(remainingPhotos);

          await mediaService.delete(deletedPhotoId.toString());

          remainingPhotos.forEach((photo, idx) => {
            expect(photo.order).toBe(idx);
            expect(photo.save).toHaveBeenCalled();
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});
