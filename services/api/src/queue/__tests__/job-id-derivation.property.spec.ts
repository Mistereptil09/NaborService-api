import fc from 'fast-check';
import {
  stripeJobId,
  waitlistJobId,
  eventRegisterJobId,
} from '../utils/job-id';

describe('Job ID Derivation', () => {
  it('stripeJobId returns eventId', () => {
    fc.assert(
      fc.property(fc.string(), (eventId) => stripeJobId(eventId) === eventId),
      { numRuns: 100 },
    );
  });

  it('waitlistJobId returns eventId:userId', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (eventId, userId) =>
          waitlistJobId(eventId, userId) === `${eventId}:${userId}`,
      ),
      { numRuns: 100 },
    );
  });

  it('eventRegisterJobId returns eventId:userId', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (eventId, userId) =>
          eventRegisterJobId(eventId, userId) === `${eventId}:${userId}`,
      ),
      { numRuns: 100 },
    );
  });
});
