import * as fc from 'fast-check';
import { RateLimitService } from '../../rate-limit.service';

describe('Property 10: Rate limiting enforcement', () => {
  let service: RateLimitService;
  let mockRedisClient: any;

  beforeEach(() => {
    mockRedisClient = {
      get: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
    };
    service = new RateLimitService(mockRedisClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should enforce limits and block requests exceeding limit L in window W', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          limit: fc.integer({ min: 1, max: 20 }),
          window: fc.integer({ min: 10, max: 900 }),
        }),
        async (data) => {
          const limit = data.limit;
          const window = data.window;

          mockRedisClient.get.mockResolvedValue(null);

          for (let i = 1; i <= limit; i++) {
            mockRedisClient.incr.mockResolvedValueOnce(i);
            const result = await service.check('key', limit, window);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(limit - i);
          }

          mockRedisClient.incr.mockResolvedValueOnce(limit + 1);
          mockRedisClient.ttl.mockResolvedValueOnce(window - 5);

          const blockResult = await service.check('key', limit, window);
          expect(blockResult.allowed).toBe(false);
          expect(blockResult.remaining).toBe(0);
          expect(blockResult.retryAfter).toBe(window - 5);
        },
      ),
      { numRuns: 50 },
    );
  });
});
