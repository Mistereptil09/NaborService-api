import * as fc from 'fast-check';
import { createTotalSizePreSaveHook } from '../../validators/size-validators';

describe('Property 5: Total binary size pre-save enforcement', () => {
  it('should enforce aggregate size limits on ListingDocument (max 12 MB)', () => {
    const hook = createTotalSizePreSaveHook({
      binaryFields: [{ path: 'photos', isArray: true, sizeField: 'size_bytes' }],
      maxTotalBytes: 12582912, // 12 MB
    });

    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5_000_000 }), { minLength: 0, maxLength: 8 }),
        sizes => {
          const mockDoc = {
            get: (path: string) => {
              if (path === 'photos') return sizes.map(s => ({ size_bytes: s }));
              return null;
            },
          };

          const total = sizes.reduce((acc, val) => acc + val, 0);
          let error: any;
          hook.call(mockDoc, (err: any) => {
            error = err;
          });

          if (total <= 12582912) {
            expect(error).toBeUndefined();
          } else {
            expect(error).toBeDefined();
            expect(error.errors.total_size.message).toBe(
              `Total binary size (${total} bytes) exceeds maximum of 12582912 bytes`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should enforce aggregate size limits on Message (max 13.5 MB)', () => {
    const hook = createTotalSizePreSaveHook({
      binaryFields: [{ path: 'attachments', isArray: true, sizeField: 'size_bytes' }],
      maxTotalBytes: 14155776, // 13.5 MB
    });

    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 6_000_000 }), { minLength: 0, maxLength: 3 }),
        sizes => {
          const mockDoc = {
            get: (path: string) => {
              if (path === 'attachments') return sizes.map(s => ({ size_bytes: s }));
              return null;
            },
          };

          const total = sizes.reduce((acc, val) => acc + val, 0);
          let error: any;
          hook.call(mockDoc, (err: any) => {
            error = err;
          });

          if (total <= 14155776) {
            expect(error).toBeUndefined();
          } else {
            expect(error).toBeDefined();
            expect(error.errors.total_size.message).toBe(
              `Total binary size (${total} bytes) exceeds maximum of 14155776 bytes`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should enforce aggregate size limits on EventDocument (max 13.5 MB)', () => {
    const hook = createTotalSizePreSaveHook({
      binaryFields: [
        { path: 'cover', isArray: false, sizeField: 'size_bytes' },
        { path: 'attachments', isArray: true, sizeField: 'size_bytes' },
      ],
      maxTotalBytes: 14155776, // 13.5 MB
    });

    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 15_000_000 })),
        fc.array(fc.integer({ min: 0, max: 6_000_000 })),
        (coverSize, attachSizes) => {
          const mockDoc = {
            get: (path: string) => {
              if (path === 'cover') return coverSize !== null ? { size_bytes: coverSize } : null;
              if (path === 'attachments') return attachSizes.map(s => ({ size_bytes: s }));
              return null;
            },
          };

          const total = (coverSize !== null ? coverSize : 0) + attachSizes.reduce((acc, val) => acc + val, 0);
          let error: any;
          hook.call(mockDoc, (err: any) => {
            error = err;
          });

          if (total <= 14155776) {
            expect(error).toBeUndefined();
          } else {
            expect(error).toBeDefined();
            expect(error.errors.total_size.message).toBe(
              `Total binary size (${total} bytes) exceeds maximum of 14155776 bytes`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
