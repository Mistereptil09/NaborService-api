export function partitionIntoBatches<T>(items: T[], batchSize = 100): T[][] {
  const size = Math.max(10, Math.min(500, batchSize));
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
