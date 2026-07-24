export function redisRetryStrategy(times: number): number {
  return Math.min(500 * Math.pow(2, times - 1), 30000);
}
