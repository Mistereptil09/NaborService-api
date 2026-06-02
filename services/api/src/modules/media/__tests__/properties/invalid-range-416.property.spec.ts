import * as fc from 'fast-check';
import { MediaController } from '../../media.controller';
import { Types } from 'mongoose';

describe('Feature: gridfs-media-storage, Property 18: Invalid Range Returns 416', () => {
  let mediaController: MediaController;
  let mockMediaService: any;
  let mockGridFSService: any;
  let mockListingRepo: any;
  let mockUserRepo: any;

  beforeEach(() => {
    mockMediaService = {
      findById: jest.fn(),
    };
    mockGridFSService = {
      getFileInfo: jest.fn(),
    };
    mockListingRepo = {};
    mockUserRepo = {};

    mediaController = new MediaController(
      mockMediaService,
      mockGridFSService,
      mockListingRepo,
      mockUserRepo,
    );
  });

  it('should return 416 and correct Content-Range header for invalid range requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 1000 }),
        async (totalSize) => {
          const start = totalSize + 10;
          const end = totalSize + 20;

          const mediaId = new Types.ObjectId().toString();
          const gridfsFileId = new Types.ObjectId();

          mockMediaService.findById.mockResolvedValue({
            gridfs_file_id: gridfsFileId,
            mimetype: 'image/png',
            owner_type: 'listing_photo',
          });

          mockGridFSService.getFileInfo.mockResolvedValue({
            length: totalSize,
          });

          const req = {
            headers: {
              range: `bytes=${start}-${end}`,
            },
          };

          const res: any = {
            headers: {},
            statusCode: 200,
            body: '',
            setHeader(name: string, value: string) {
              this.headers[name.toLowerCase()] = value;
              return this;
            },
            status(code: number) {
              this.statusCode = code;
              return this;
            },
            send(data: any) {
              this.body = data;
              return this;
            },
          };

          await mediaController.streamMedia(mediaId, req, res);

          expect(res.statusCode).toBe(416);
          expect(res.headers['content-range']).toBe(`bytes */${totalSize}`);
        },
      ),
      { numRuns: 50 },
    );
  });
});
