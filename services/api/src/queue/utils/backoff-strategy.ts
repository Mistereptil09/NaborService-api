const delays: Record<string, number[]> = {
  'neo4j-sync': [1000, 5000, 30000],
  'email': [2000, 8000, 32000],
  'pdf-generation': [1000, 5000, 30000],
  'stripe-webhook': [1000, 5000, 30000],
  'waitlist-promote': [500, 1000, 2000],
  'rgpd-anonymise': [30000, 120000, 480000],
  'crypto-rotation': [1000, 5000, 30000],
  'event-register': [500, 1000, 2000],
  'contract-expiration': [1000, 5000, 30000],
};

/**
 * Returns the backoff delay in milliseconds.
 * In BullMQ, attemptsMade is the number of attempts already made.
 * If 1 attempt has been made (it just failed once), attemptsMade is 1, and we return the first delay (index 0).
 */
export function getBackoffDelay(queueName: string, attemptsMade: number): number {
  const queueDelays = delays[queueName];
  if (!queueDelays) return 1000;
  
  // attempt 1 -> index 0, attempt 2 -> index 1, etc.
  const index = Math.max(0, Math.min(attemptsMade - 1, queueDelays.length - 1));
  return queueDelays[index];
}
