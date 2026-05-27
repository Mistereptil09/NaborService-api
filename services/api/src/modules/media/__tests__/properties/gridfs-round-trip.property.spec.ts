import * as fc from 'fast-check';
import { GridFSService } from '../../services/gridfs.service';
import { Types } from 'mongoose';
import { Readable, Writable } from 'stream';

describe('Feature: gridfs-media-storage, Property 1: GridFS Storage Round-Trip', () => {
  let gridfsService: GridFSService;
  let mockBucket: any;
  let mockConnection: any;

  beforeEach(() => {
    mockBucket = {
      openUploadStream: jest.fn(),
      openDownloadStream: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    };

    mockConnection = {
      db: {
        collection: jest.fn(),
      }
    };

    gridfsService = new GridFSService(mockConnection);
    (gridfsService as any).bucket = mockBucket;
  });

  it('should upload a buffer and retrieve it properly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1000 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (data, filename, contentType) => {
          const buffer = Buffer.from(data);
          const fileId = new Types.ObjectId();

          const mockUploadStream: any = new Writable({
            write(chunk, encoding, callback) {
              callback();
            }
          });
          mockUploadStream.id = fileId;
          mockBucket.openUploadStream.mockReturnValue(mockUploadStream);

          setTimeout(() => {
            mockUploadStream.emit('finish');
          }, 5);

          const uploadedId = await gridfsService.upload(buffer, filename, contentType);
          expect(uploadedId).toBe(fileId);
          expect(mockBucket.openUploadStream).toHaveBeenCalledWith(filename, {
            metadata: { contentType },
          });

          mockBucket.find.mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              {
                _id: fileId,
                length: buffer.length,
                filename,
                metadata: { contentType },
                uploadDate: new Date(),
              }
            ])
          });

          const mockDownloadStream = new Readable({
            read() {
              this.push(buffer);
              this.push(null);
            }
          });
          mockBucket.openDownloadStream.mockReturnValue(mockDownloadStream);

          const downloadResult = await gridfsService.download(fileId);
          expect(downloadResult.buffer).toEqual(buffer);
          expect(downloadResult.contentType).toBe(contentType);
          expect(downloadResult.filename).toBe(filename);
          expect(downloadResult.length).toBe(buffer.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
