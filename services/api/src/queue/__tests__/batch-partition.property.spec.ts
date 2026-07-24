import fc from 'fast-check';
import { partitionIntoBatches } from '../utils/batch-partition';

describe('Batch Partition', () => {
  it('should preserve all items and order when splitting', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        fc.integer({ min: -100, max: 1000 }),
        (items, requestedSize) => {
          const batches = partitionIntoBatches(items, requestedSize);
          const flattened = batches.flat();
          return (
            flattened.length === items.length &&
            flattened.every((val, idx) => val === items[idx])
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should clamp batch sizes between 10 and 500', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1000, maxLength: 2000 }),
        fc.integer({ min: -1000, max: 2000 }),
        (items, requestedSize) => {
          const batches = partitionIntoBatches(items, requestedSize);
          if (batches.length === 0) return true;

          for (let i = 0; i < batches.length - 1; i++) {
            const size = batches[i].length;
            if (size < 10 || size > 500) return false;
            if (requestedSize < 10 && size !== 10) return false;
            if (requestedSize > 500 && size !== 500) return false;
            if (
              requestedSize >= 10 &&
              requestedSize <= 500 &&
              size !== requestedSize
            )
              return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
