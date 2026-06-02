import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SsoService } from '../sso.service';
import { User } from '../../users/entities/user.entity';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { TokenService } from '../token.service';
import { SessionService } from '../session.service';
import { SsoGateway } from '../sso.gateway';
import { HttpException, NotFoundException, UnauthorizedException } from '@nestjs/common';

describe('SsoService', () => {
  let service: SsoService;
  let userRepo: Repository<User>;
  let redisClient: any;
  let tokenService: any;
  let sessionService: any;
  let ssoGateway: any;

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    smembers: jest.fn(),
    srem: jest.fn(),
    sadd: jest.fn(),
  };

  const mockTokenService = {
    generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
    generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
    hashRefreshToken: jest.fn().mockReturnValue('mock-refresh-token-hash'),
    storeRefreshInRedis: jest.fn().mockResolvedValue(undefined),
  };

  const mockSessionService = {
    createSession: jest.fn().mockResolvedValue({ id: 'mock-session-id' }),
  };

  const mockSsoGateway = {
    emitQrValidated: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: REDIS_CLIENT, useValue: mockRedisClient },
        { provide: TokenService, useValue: mockTokenService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: SsoGateway, useValue: mockSsoGateway },
      ],
    }).compile();

    service = module.get<SsoService>(SsoService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    redisClient = module.get(REDIS_CLIENT);
    tokenService = module.get(TokenService);
    sessionService = module.get(SessionService);
    ssoGateway = module.get(SsoGateway);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateQr', () => {
    it('should generate a QR code data URI and store session successfully', async () => {
      const ip = '127.0.0.1';
      mockRedisClient.incr.mockResolvedValueOnce(1); // rate limit count = 1
      mockRedisClient.smembers.mockResolvedValueOnce([]); // no active sessions

      const qr = await service.generateQr(ip);

      expect(qr).toContain('data:image/png;base64,');
      expect(mockRedisClient.incr).toHaveBeenCalledWith(`rate:sso:generate:${ip}`);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(`rate:sso:generate:${ip}`, 60);
      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockRedisClient.sadd).toHaveBeenCalled();
    });

    it('should throw HttpException if rate limit is exceeded', async () => {
      const ip = '127.0.0.1';
      mockRedisClient.incr.mockResolvedValueOnce(6); // rate limit count > 5

      await expect(service.generateQr(ip)).rejects.toThrow(
        new HttpException('Too many SSO requests from this IP', 429)
      );
    });

    it('should throw HttpException if too many active sessions exist', async () => {
      const ip = '127.0.0.1';
      mockRedisClient.incr.mockResolvedValueOnce(2);
      // Mock active keys list
      const activeKeys = ['sso:qr:key1', 'sso:qr:key2', 'sso:qr:key3'];
      mockRedisClient.smembers.mockResolvedValueOnce(activeKeys);
      // All 3 exist
      mockRedisClient.exists.mockResolvedValue(1);

      await expect(service.generateQr(ip)).rejects.toThrow(
        new HttpException('Too many active SSO sessions for this IP', 429)
      );
    });

    it('should clean up expired keys from active set', async () => {
      const ip = '127.0.0.1';
      mockRedisClient.incr.mockResolvedValueOnce(1);
      const activeKeys = ['sso:qr:key1', 'sso:qr:key2'];
      mockRedisClient.smembers.mockResolvedValueOnce(activeKeys);
      // first doesn't exist, second does
      mockRedisClient.exists.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

      const qr = await service.generateQr(ip);

      expect(qr).toContain('data:image/png;base64,');
      expect(mockRedisClient.srem).toHaveBeenCalledWith(`sso:ip_keys:${ip}`, 'sso:qr:key1');
    });
  });

  describe('validateQr', () => {
    it('should validate QR, create session, and emit WebSocket event', async () => {
      const tokenUuid = 'test-token-uuid';
      const userId = 'test-user-id';
      const ssoKey = `sso:qr:${tokenUuid}`;
      const mockPayload = {
        status: 'pending',
        user_id: null,
        ip_address: '127.0.0.1',
        created_at: new Date().toISOString(),
      };

      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockPayload));
      mockUserRepository.findOne.mockResolvedValueOnce({ id: userId } as User);

      await service.validateQr(tokenUuid, userId, 'TestAgent');

      expect(mockRedisClient.get).toHaveBeenCalledWith(ssoKey);
      expect(mockUserRepository.findOne).toHaveBeenCalled();
      expect(mockSessionService.createSession).toHaveBeenCalledWith({
        userId,
        refreshTokenHash: 'mock-refresh-token-hash',
        deviceName: 'Java Desktop Client (SSO)',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent',
        expiresAt: expect.any(Date),
      });
      expect(mockTokenService.storeRefreshInRedis).toHaveBeenCalled();
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        ssoKey,
        expect.stringContaining('"status":"validated"'),
        'EX',
        60
      );
      expect(mockSsoGateway.emitQrValidated).toHaveBeenCalledWith(
        tokenUuid,
        'mock-access-token',
        'mock-refresh-token'
      );
    });

    it('should throw NotFoundException if SSO session does not exist', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      await expect(service.validateQr('uuid', 'user')).rejects.toThrow(NotFoundException);
    });

    it('should throw Conflict Exception if SSO session is already validated', async () => {
      const mockPayload = {
        status: 'validated',
        user_id: 'user',
        ip_address: '127.0.0.1',
        created_at: new Date().toISOString(),
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockPayload));

      await expect(service.validateQr('uuid', 'user')).rejects.toThrow(HttpException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const mockPayload = {
        status: 'pending',
        user_id: null,
        ip_address: '127.0.0.1',
        created_at: new Date().toISOString(),
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockPayload));
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.validateQr('uuid', 'user')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('checkStatus', () => {
    it('should return expired if no data found in Redis', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      const res = await service.checkStatus('uuid');
      expect(res).toEqual({ status: 'expired' });
    });

    it('should return validated with tokens if status is validated', async () => {
      const mockPayload = {
        status: 'validated',
        user_id: 'user',
        ip_address: '127.0.0.1',
        created_at: new Date().toISOString(),
        access_token: 'at',
        refresh_token: 'rt',
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockPayload));

      const res = await service.checkStatus('uuid');
      expect(res).toEqual({
        status: 'validated',
        access_token: 'at',
        refresh_token: 'rt',
      });
    });

    it('should return pending if status is pending', async () => {
      const mockPayload = {
        status: 'pending',
        user_id: null,
        ip_address: '127.0.0.1',
        created_at: new Date().toISOString(),
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockPayload));

      const res = await service.checkStatus('uuid');
      expect(res).toEqual({ status: 'pending' });
    });
  });
});
