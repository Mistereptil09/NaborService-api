import fc from 'fast-check';
import { getBackoffDelay } from '../utils/backoff-strategy';

// Feature: bullmq-integration, Property 1: Backoff strategy produces correct delays for all queues and attempts
describe('Backoff Strategy', () => {
  const delaysMap: Record<string, number[]> = {
    'neo4j-sync': [1000, 5000, 30000],
    email: [2000, 8000, 32000],
    'pdf-generation': [1000, 5000, 30000],
    'stripe-webhook': [1000, 5000, 30000],
    'waitlist-promote': [500, 1000, 2000],
    'rgpd-anonymise': [30000, 120000, 480000],
    'crypto-rotation': [1000, 5000, 30000],
    'event-register': [500, 1000, 2000],
    'contract-expiration': [1000, 5000, 30000],
  };

  it('should return correct delays for known queues and attempts', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(delaysMap)),
        fc.integer({ min: 1, max: 3 }),
        (queueName, attempt) => {
          const delay = getBackoffDelay(queueName, attempt);
          const expected = delaysMap[queueName][attempt - 1];
          return delay === expected;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should fallback to 1000ms for unknown queues', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !(s in delaysMap)),
        fc.integer(),
        (queueName, attempt) => getBackoffDelay(queueName, attempt) === 1000,
      ),
      { numRuns: 100 },
    );
  });
});
