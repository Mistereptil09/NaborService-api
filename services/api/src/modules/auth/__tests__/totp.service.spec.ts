import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { TotpService } from '../totp.service';
import { User } from '../../users/entities/user.entity';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { RateLimitService } from '../rate-limit.service';

jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
  generateURI: jest
    .fn()
    .mockReturnValue(
      'otpauth://totp/NaborServices:test@test.com?secret=JBSWY3DPEHPK3PXP',
    ),
  verifySync: jest.fn(),
}));

import * as otp from 'otplib';

describe('TotpService', () => {
  let service: TotpService;
  let userRepo: Repository<User>;
  let redisClient: any;

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
  };

  const mockConfigService = {
    get: jest
      .fn()
      .mockReturnValue(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ),
  };

  const mockRateLimitService = {
    incrementLoginAttemptByUserId: jest.fn(),
    incrementTotpAttempt: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TotpService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: REDIS_CLIENT, useValue: mockRedisClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RateLimitService, useValue: mockRateLimitService },
      ],
    }).compile();

    service = module.get<TotpService>(TotpService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    redisClient = module.get(REDIS_CLIENT);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Encryption / Decryption', () => {
    it('should encrypt and decrypt a secret successfully', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = service.encryptSecret(secret);

      expect(encrypted).toContain(':');
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = service.decryptSecret(encrypted);
      expect(decrypted).toBe(secret);
    });
  });

  describe('isUserBlocked', () => {
    it('should return true if block exists in Redis', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(1);
      const result = await service.isUserBlocked('user-id');
      expect(result).toBe(true);
      expect(redisClient.exists).toHaveBeenCalledWith('totp:blocked:user-id');
    });

    it('should return false if block does not exist', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(0);
      const result = await service.isUserBlocked('user-id');
      expect(result).toBe(false);
    });
  });

  describe('createChallenge', () => {
    it('should create a challenge token in Redis', async () => {
      const challengeToken = await service.createChallenge('user-id', 'login');
      expect(challengeToken).toBeDefined();
      expect(redisClient.set).toHaveBeenCalledWith(
        `totp:pending:${challengeToken}`,
        expect.stringContaining('"user_id":"user-id"'),
        'EX',
        300,
      );
    });
  });

  describe('setupTotp', () => {
    it('should initiate setup and return otpauthUrl', async () => {
      const user = {
        id: 'user-id',
        email: 'test@test.com',
        totpSecret: null,
      } as User;
      mockUserRepository.findOne.mockResolvedValueOnce(user);

      const result = await service.setupTotp('user-id', 'test@test.com');

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-id' },
      });
      expect(otp.generateSecret).toHaveBeenCalledWith();
      expect(otp.generateURI).toHaveBeenCalledWith({
        label: 'test@test.com',
        issuer: 'NaborServices',
        secret: 'JBSWY3DPEHPK3PXP',
      });
      expect(redisClient.set).toHaveBeenCalledWith(
        'totp:setup:user-id',
        expect.stringContaining('"encrypted_secret"'),
        'EX',
        600,
      );
      expect(result).toEqual({
        otpauthUrl:
          'otpauth://totp/NaborServices:test@test.com?secret=JBSWY3DPEHPK3PXP',
      });
    });
  });

  describe('confirmTotp', () => {
    it('should throw if setup payload not found in Redis', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      await expect(service.confirmTotp('user-id', '123456')).rejects.toThrow(
        'Setup expiré ou non initié',
      );
    });

    it('should save secret to user when code is valid', async () => {
      const encrypted = service.encryptSecret('JBSWY3DPEHPK3PXP');
      const setupPayload = { encrypted_secret: encrypted, attempts: 0 };
      const user = { id: 'user-id', totpSecret: null } as User;

      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(setupPayload));
      (otp.verifySync as jest.Mock).mockReturnValueOnce({
        valid: true,
        delta: 0,
      });
      mockUserRepository.findOne.mockResolvedValueOnce(user);

      await service.confirmTotp('user-id', '123456');

      expect(otp.verifySync).toHaveBeenCalledWith(
        expect.objectContaining({
          token: '123456',
          secret: 'JBSWY3DPEHPK3PXP',
        }),
      );
      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'user-id' },
      });
      expect(user.totpSecret).toBe(encrypted);
      expect(userRepo.save).toHaveBeenCalledWith(user);
      expect(redisClient.del).toHaveBeenCalledWith('totp:setup:user-id');
    });

    it('should increment attempts and throw if code is invalid', async () => {
      const encrypted = service.encryptSecret('JBSWY3DPEHPK3PXP');
      const setupPayload = { encrypted_secret: encrypted, attempts: 0 };

      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(setupPayload));
      (otp.verifySync as jest.Mock).mockReturnValueOnce({ valid: false });

      await expect(service.confirmTotp('user-id', '111111')).rejects.toThrow(
        'Code TOTP invalide',
      );

      expect(redisClient.set).toHaveBeenCalledWith(
        'totp:setup:user-id',
        JSON.stringify({ encrypted_secret: encrypted, attempts: 1 }),
        'EX',
        600,
      );
    });

    it('should delete setup payload and lock user when attempts reach 3', async () => {
      const encrypted = service.encryptSecret('JBSWY3DPEHPK3PXP');
      const setupPayload = { encrypted_secret: encrypted, attempts: 2 };

      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(setupPayload));
      (otp.verifySync as jest.Mock).mockReturnValueOnce({ valid: false });

      await expect(service.confirmTotp('user-id', '111111')).rejects.toThrow(
        'Setup expiré, relancez le flux',
      );

      expect(redisClient.del).toHaveBeenCalledWith('totp:setup:user-id');
    });
  });

  describe('verifyTotp', () => {
    it('should throw if TOTP is not configured', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce({
        id: 'user-id',
        totpSecret: null,
      });

      await expect(service.verifyTotp('user-id', '123456')).rejects.toThrow(
        'TOTP non configuré',
      );
    });

    it('should verify a valid code', async () => {
      const encrypted = service.encryptSecret('JBSWY3DPEHPK3PXP');
      mockUserRepository.findOne.mockResolvedValueOnce({
        id: 'user-id',
        totpSecret: encrypted,
      });
      mockRedisClient.exists.mockResolvedValueOnce(0);
      (otp.verifySync as jest.Mock).mockReturnValueOnce({ valid: true });

      await expect(
        service.verifyTotp('user-id', '123456'),
      ).resolves.toBeUndefined();
      expect(otp.verifySync).toHaveBeenCalledWith(
        expect.objectContaining({
          token: '123456',
          secret: 'JBSWY3DPEHPK3PXP',
        }),
      );
    });

    it('should throw if code is invalid', async () => {
      const encrypted = service.encryptSecret('JBSWY3DPEHPK3PXP');
      mockUserRepository.findOne.mockResolvedValueOnce({
        id: 'user-id',
        totpSecret: encrypted,
      });
      mockRedisClient.exists.mockResolvedValueOnce(0);
      (otp.verifySync as jest.Mock).mockReturnValueOnce({ valid: false });

      await expect(service.verifyTotp('user-id', '111111')).rejects.toThrow(
        'TOTP requis ou invalide',
      );
    });

    it('should throw if user is temporarily blocked', async () => {
      const encrypted = service.encryptSecret('JBSWY3DPEHPK3PXP');
      mockUserRepository.findOne.mockResolvedValueOnce({
        id: 'user-id',
        totpSecret: encrypted,
      });
      mockRedisClient.exists.mockResolvedValueOnce(1);

      await expect(service.verifyTotp('user-id', '123456')).rejects.toThrow(
        'Trop de tentatives, compte temporairement bloqué',
      );
    });
  });
});
