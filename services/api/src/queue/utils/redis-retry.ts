/**
 * Calculates the retry delay for the Redis connection using exponential backoff.
 * Starts at 500ms, doubles per attempt, max 30s interval.
 *
 * Also documents stalled job behavior:
 * After Redis reconnection, BullMQ's stalled job checker automatically
 * recovers active jobs that were disconnected, re-queuing them per the queue's retry policy.
 */
export function redisRetryStrategy(times: number): number {
  return Math.min(500 * Math.pow(2, times - 1), 30000);
}
