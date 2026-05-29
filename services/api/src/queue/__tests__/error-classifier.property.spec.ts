import fc from 'fast-check';
import { UnrecoverableError } from 'bullmq';
import { classifyAndThrow } from '../utils/error-classifier';

// Feature: bullmq-integration, Property 2: Error classification correctly distinguishes transient from non-transient errors
describe('Error Classifier', () => {
  const transientMessages = [
    'ECONNREFUSED 127.0.0.1:6379',
    'Connection ETIMEDOUT',
    'ECONNRESET',
    'socket hang up',
    'HTTP 500 Internal Server Error',
    'HTTP 503 Service Unavailable',
    'lock wait timeout exceeded',
    'Redis is unavailable',
  ];

  it('should re-throw transient errors', () => {
    fc.assert(
      fc.property(fc.constantFrom(...transientMessages), (msg) => {
        let threw = false;
        try {
          classifyAndThrow(new Error(msg));
        } catch (e: any) {
          threw = true;
          return !(e instanceof UnrecoverableError) && e.message === msg;
        }
        return threw;
      }),
      { numRuns: 100 }
    );
  });

  it('should wrap non-transient errors in UnrecoverableError', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !transientMessages.some((msg) => s.includes(msg.split(' ')[0])) && !/5\d{2}/.test(s) && !/lock/i.test(s) && !/redis/i.test(s) && !/econn/i.test(s) && !/socket/i.test(s) && !/timedout/i.test(s)),
        (msg) => {
          let threw = false;
          try {
            classifyAndThrow(new Error(msg));
          } catch (e: any) {
            threw = true;
            return e instanceof UnrecoverableError && e.message === msg;
          }
          return threw;
        }
      ),
      { numRuns: 100 }
    );
  });
});
