const delays: Record<string, number[]> = {
  'neo4j-sync': [
    1000, 5000, 30000, 60000, 300000, 600000, 1800000, 3600000, 7200000,
    14400000,
  ],
  email: [2000, 8000, 32000],
  'pdf-generation': [1000, 5000, 30000],
  'stripe-webhook': [1000, 5000, 30000],
  'waitlist-promote': [500, 1000, 2000],
  'rgpd-anonymise': [30000, 120000, 480000],
  'crypto-rotation': [1000, 5000, 30000],
  'event-register': [500, 1000, 2000],
  'contract-expiration': [1000, 5000, 30000],
  'call-timeout': [1000, 5000, 30000],
};

export function getBackoffDelay(
  queueName: string,
  attemptsMade: number,
): number {
  const queueDelays = delays[queueName];
  if (!queueDelays) return 1000;

  const index = Math.max(0, Math.min(attemptsMade - 1, queueDelays.length - 1));
  return queueDelays[index];
}
