import { redisRetryStrategy } from '../redis-retry';

describe('redisRetryStrategy', () => {
  it('should start at 500ms', () => {
    expect(redisRetryStrategy(1)).toBe(500);
  });

  it('should double per attempt', () => {
    expect(redisRetryStrategy(2)).toBe(1000);
    expect(redisRetryStrategy(3)).toBe(2000);
    expect(redisRetryStrategy(4)).toBe(4000);
  });

  it('should cap at 30s (30000ms)', () => {
    // 500 * 2^6 = 32000
    expect(redisRetryStrategy(7)).toBe(30000);
    expect(redisRetryStrategy(10)).toBe(30000);
  });
});
