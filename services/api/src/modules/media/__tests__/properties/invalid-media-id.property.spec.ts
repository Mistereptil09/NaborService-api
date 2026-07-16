import * as fc from 'fast-check';
import { MediaController } from '../../media.controller';
import { BadRequestException } from '@nestjs/common';

describe('Feature: gridfs-media-storage, Property 8: Invalid Media ID Validation', () => {
  let mediaController: MediaController;
  let mockMediaService: any;
  let mockGridFSService: any;
  let mockListingRepo: any;
  let mockUserRepo: any;

  beforeEach(() => {
    mockMediaService = {};
    mockGridFSService = {};
    mockListingRepo = {};
    mockUserRepo = {};

    mediaController = new MediaController(
      mockMediaService,
      mockGridFSService,
      mockListingRepo,
      mockUserRepo,
      {} as any,
      {} as any,
    );
  });

  it('should throw BadRequestException if mediaId is not a valid 24-character hex string', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (mediaId) => {
        if (/^[0-9a-fA-F]{24}$/.test(mediaId)) {
          return;
        }

        const req = {};
        const res: any = {};

        await expect(
          mediaController.streamMedia(mediaId, req, res),
        ).rejects.toThrow(BadRequestException);
      }),
      { numRuns: 100 },
    );
  });
});
