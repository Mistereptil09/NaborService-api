import * as fc from 'fast-check';
import { GridFSService } from '../../services/gridfs.service';
import { Types } from 'mongoose';

describe('Feature: gridfs-media-storage, Property 2: GridFS Deletion Completeness', () => {
  let gridfsService: GridFSService;
  let mockBucket: any;
  let mockConnection: any;

  beforeEach(() => {
    mockBucket = {
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

  it('should call bucket.delete with the correct fileId and delete the file completely', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 24, maxLength: 24 }),
        async (charArray) => {
          const hexId = charArray.join('');
          const fileId = new Types.ObjectId(hexId);
          mockBucket.delete.mockResolvedValue(undefined);

          await gridfsService.delete(fileId);

          expect(mockBucket.delete).toHaveBeenCalledWith(fileId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
