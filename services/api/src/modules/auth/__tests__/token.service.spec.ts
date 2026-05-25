import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../token.service';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { User } from '../../users/entities/user.entity';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: JwtService;
  let redisClient: any;

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  const mockRedisClient = {
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: REDIS_CLIENT, useValue: mockRedisClient },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    jwtService = module.get<JwtService>(JwtService);
    redisClient = module.get(REDIS_CLIENT);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAccessToken', () => {
    it('should generate a JWT access token with user details', () => {
      const mockUser = {
        id: 'user-uuid',
        role: 'resident',
        locale: 'fr',
      } as User;

      const token = service.generateAccessToken(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'user-uuid', role: 'resident', locale: 'fr' },
        { expiresIn: '15m', algorithm: 'HS256' },
      );
      expect(token).toBe('mock-jwt-token');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a 64-character base64url refresh token', () => {
      const token = service.generateRefreshToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('hashRefreshToken', () => {
    it('should correctly hash refresh tokens with SHA-256', () => {
      const token = 'my-token';
      // SHA-256 of 'my-token' is 'fece50d2287f7245aea5819b75f95ee8bec295a14f8ef1e7a31f17f1dae9df44'
      const expectedHash = 'fece50d2287f7245aea5819b75f95ee8bec295a14f8ef1e7a31f17f1dae9df44';
      const actualHash = service.hashRefreshToken(token);
      expect(actualHash).toBe(expectedHash);
    });
  });

  describe('storeRefreshInRedis', () => {
    it('should store the refresh token in Redis with a 30-day TTL', async () => {
      const expiresAt = new Date();
      await service.storeRefreshInRedis('hash', 'user-id', 'session-id', expiresAt);

      expect(redisClient.set).toHaveBeenCalledWith(
        'refresh:hash',
        JSON.stringify({
          user_id: 'user-id',
          session_id: 'session-id',
          expires_at: expiresAt.toISOString(),
        }),
        'EX',
        2592000,
      );
    });
  });

  describe('deleteRefreshFromRedis', () => {
    it('should delete key from Redis', async () => {
      await service.deleteRefreshFromRedis('hash');
      expect(redisClient.del).toHaveBeenCalledWith('refresh:hash');
    });
  });

  describe('lookupRefreshInRedis', () => {
    it('should return parsed payload when found in Redis', async () => {
      const payload = { user_id: 'user-id', session_id: 'session-id', expires_at: 'date' };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(payload));

      const result = await service.lookupRefreshInRedis('hash');
      expect(redisClient.get).toHaveBeenCalledWith('refresh:hash');
      expect(result).toEqual(payload);
    });

    it('should return null when not found', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      const result = await service.lookupRefreshInRedis('hash');
      expect(result).toBeNull();
    });
  });
});
