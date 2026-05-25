import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from '../rate-limit.service';
import { REDIS_CLIENT } from '../../../database/redis.module';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let redisClient: any;

  const mockRedisClient = {
    get: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: REDIS_CLIENT, useValue: mockRedisClient },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
    redisClient = module.get(REDIS_CLIENT);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('check', () => {
    it('should allow request when current count is below limit', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.incr.mockResolvedValueOnce(1);
      mockRedisClient.expire.mockResolvedValueOnce(1);

      const result = await service.check('key', 5, 60);

      expect(redisClient.get).toHaveBeenCalledWith('key');
      expect(redisClient.incr).toHaveBeenCalledWith('key');
      expect(redisClient.expire).toHaveBeenCalledWith('key', 60);
      expect(result).toEqual({
        allowed: true,
        remaining: 4,
        retryAfter: 0,
      });
    });

    it('should NOT allow request when cached count already exceeds limit', async () => {
      mockRedisClient.get.mockResolvedValueOnce('5');
      mockRedisClient.ttl.mockResolvedValueOnce(45);

      const result = await service.check('key', 5, 60);

      expect(redisClient.get).toHaveBeenCalledWith('key');
      expect(redisClient.incr).not.toHaveBeenCalled();
      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        retryAfter: 45,
      });
    });

    it('should block and return remaining time when newly incremented count exceeds limit', async () => {
      mockRedisClient.get.mockResolvedValueOnce('4');
      mockRedisClient.incr.mockResolvedValueOnce(6);
      mockRedisClient.ttl.mockResolvedValueOnce(50);

      const result = await service.check('key', 5, 60);

      expect(redisClient.get).toHaveBeenCalledWith('key');
      expect(redisClient.incr).toHaveBeenCalledWith('key');
      expect(redisClient.ttl).toHaveBeenCalledWith('key');
      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        retryAfter: 50,
      });
    });

    it('should not call expire if count is not 1 (already set)', async () => {
      mockRedisClient.get.mockResolvedValueOnce('1');
      mockRedisClient.incr.mockResolvedValueOnce(2);

      const result = await service.check('key', 5, 60);

      expect(redisClient.expire).not.toHaveBeenCalled();
      expect(result).toEqual({
        allowed: true,
        remaining: 3,
        retryAfter: 0,
      });
    });
  });
});
