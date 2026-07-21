import * as fc from 'fast-check';
import { MediaController } from '../../media.controller';
import { Types } from 'mongoose';
import { Readable } from 'stream';

describe('Feature: gridfs-media-storage, Property 7: Range Header Partial Content', () => {
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
      openDownloadStream: jest.fn(),
    };
    mockListingRepo = {};
    mockUserRepo = {};

    mediaController = new MediaController(
      mockMediaService,
      mockGridFSService,
      mockListingRepo,
      mockUserRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should return 206 status and correct Content-Range header for valid Range requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 10, maxLength: 100 }),
        async (data) => {
          const buffer = Buffer.from(data);
          const totalSize = buffer.length;

          const start = Math.floor(Math.random() * (totalSize - 2));
          const end =
            Math.floor(Math.random() * (totalSize - start - 1)) + start;

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

          const mockDownloadStream = new Readable({
            read() {
              this.push(buffer.subarray(start, end + 1));
              this.push(null);
            },
          });
          mockGridFSService.openDownloadStream.mockReturnValue(
            mockDownloadStream,
          );

          const req = {
            headers: {
              range: `bytes=${start}-${end}`,
            },
            user: {
              sub: 'test-user',
              email: 'test@test.com',
              role: 'resident',
            },
          };

          const res: any = {
            headers: {},
            statusCode: 200,
            body: Buffer.alloc(0),
            setHeader(name: string, value: string) {
              this.headers[name.toLowerCase()] = value;
              return this;
            },
            status(code: number) {
              this.statusCode = code;
              return this;
            },
            write(chunk: any) {
              this.body = Buffer.concat([
                this.body,
                Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
              ]);
              return true;
            },
            end() {},
            on(event: string, callback: any) {
              if (event === 'finish' || event === 'close') {
                setTimeout(callback, 2);
              }
              return this;
            },
            once() {
              return this;
            },
            emit() {
              return this;
            },
          };

          mockDownloadStream.on('end', () => {
            res.body = Buffer.concat([res.body]);
          });

          await mediaController.streamMedia(mediaId, req as any, res);

          expect(res.statusCode).toBe(206);
          expect(res.headers['content-range']).toBe(
            `bytes ${start}-${end}/${totalSize}`,
          );
          expect(res.headers['content-length']).toBe(
            (end - start + 1).toString(),
          );
          // GridFS's `end` option is EXCLUSIVE, unlike the inclusive HTTP
          // Range end — passing `end` unshifted streams one byte fewer than
          // Content-Length promises, hanging every ranged client until its
          // own timeout (media elements always use Range requests).
          expect(mockGridFSService.openDownloadStream).toHaveBeenCalledWith(
            gridfsFileId,
            { start, end: end + 1 },
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});
