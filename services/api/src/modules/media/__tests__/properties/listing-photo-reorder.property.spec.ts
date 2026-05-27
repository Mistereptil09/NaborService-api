import * as fc from 'fast-check';
import { MediaService } from '../../services/media.service';
import { Types } from 'mongoose';

describe('Feature: gridfs-media-storage, Property 10: Listing Photo Reorder Matches Array Positions', () => {
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

  it('should assign order matching the array index positions for a valid permutation of media_ids', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        async (n) => {
          const listingId = 'listing-uuid-123';
          const photos: any[] = [];
          for (let i = 0; i < n; i++) {
            photos.push({
              _id: new Types.ObjectId(),
              owner_type: 'listing_photo',
              owner_id: listingId,
              order: i,
              save: jest.fn().mockResolvedValue(undefined),
            });
          }

          mockMediaModel.find.mockResolvedValue(photos);

          const permutation = [...photos];
          for (let i = permutation.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
          }

          const permutationIds = permutation.map((p) => p._id.toString());

          await mediaService.reorderListingPhotos(listingId, permutationIds);

          permutation.forEach((photo, idx) => {
            expect(photo.order).toBe(idx);
            expect(photo.save).toHaveBeenCalled();
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});
