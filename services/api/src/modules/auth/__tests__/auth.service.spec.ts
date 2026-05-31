import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { TokenService } from '../token.service';
import { TotpService } from '../totp.service';
import { RateLimitService } from '../rate-limit.service';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
  argon2id: 'argon2id',
}));

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: any;
  let tokenService: any;
  let sessionService: any;
  let totpService: any;
  let dataSource: any;

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockTokenService = {
    generateAccessToken: jest.fn(),
    generateRefreshToken: jest.fn(),
    hashRefreshToken: jest.fn(),
    storeRefreshInRedis: jest.fn(),
  };

  const mockSessionService = {
    createSession: jest.fn(),
  };

  const mockTotpService = {
    isUserBlocked: jest.fn(),
    createChallenge: jest.fn(),
    createSetupChallenge: jest.fn(),
  };

  const mockManager = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn((cb) => cb(mockManager)),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockRateLimitService = {
    incrementLoginAttemptByUserId: jest.fn(),
    incrementTotpAttempt: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: TokenService, useValue: mockTokenService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: TotpService, useValue: mockTotpService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RateLimitService, useValue: mockRateLimitService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepo = module.get(getRepositoryToken(User));
    tokenService = module.get(TokenService);
    sessionService = module.get(SessionService);
    totpService = module.get(TotpService);
    dataSource = module.get(DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should create user and preferences in a transaction successfully', async () => {
      const dto = { email: 'test@test.com', firstName: 'John', lastName: 'Doe', password: 'Password1!' };
      mockManager.findOne.mockResolvedValueOnce(null);
      (argon2.hash as jest.Mock).mockResolvedValueOnce('hashed-pwd');
      mockManager.create.mockImplementation((entity, data) => data);
      mockManager.save.mockImplementation((data) => ({ id: 'saved-id', ...data }));

      const result = await service.register(dto);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(mockManager.findOne).toHaveBeenCalledWith(User, { where: { email: dto.email } });
      expect(argon2.hash).toHaveBeenCalledWith(dto.password, expect.objectContaining({ type: 'argon2id' }));
      expect(result).toEqual({ message: 'Compte créé avec succès' });
    });

    it('should throw ConflictException if email is in use', async () => {
      const dto = { email: 'test@test.com', firstName: 'John', lastName: 'Doe', password: 'Password1!' };
      mockManager.findOne.mockResolvedValueOnce({ id: 'existing' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user not found, executing dummy verification', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      userRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(argon2.verify).toHaveBeenCalledWith(expect.any(String), 'password');
    });

    it('should throw UnauthorizedException if user is soft deleted', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      userRepo.findOne.mockResolvedValueOnce({ id: 'id', deletedAt: new Date() });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(argon2.verify).toHaveBeenCalledWith(expect.any(String), 'password');
    });

    it('should throw UnauthorizedException if password incorrect', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      const user = { id: 'id', passwordHash: 'hash', deletedAt: null } as User;
      userRepo.findOne.mockResolvedValueOnce(user);
      (argon2.verify as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should return challenge if TOTP enabled', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      const user = { id: 'id', passwordHash: 'hash', deletedAt: null, totpSecret: 'secret' } as User;
      userRepo.findOne.mockResolvedValueOnce(user);
      (argon2.verify as jest.Mock).mockResolvedValueOnce(true);
      totpService.isUserBlocked.mockResolvedValueOnce(false);
      totpService.createChallenge.mockResolvedValueOnce('challenge-token');

      const result = await service.login(dto);

      expect(totpService.isUserBlocked).toHaveBeenCalledWith('id');
      expect(totpService.createChallenge).toHaveBeenCalledWith('id', 'login');
      expect(result).toEqual({ challenge: 'totp_required', challenge_token: 'challenge-token' });
    });

    it('should return setup challenge if TOTP disabled (mandatory TOTP)', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      const user = { id: 'id', email: 'test@test.com', passwordHash: 'hash', deletedAt: null, totpSecret: null } as User;
      userRepo.findOne.mockResolvedValueOnce(user);
      (argon2.verify as jest.Mock).mockResolvedValueOnce(true);
      totpService.isUserBlocked.mockResolvedValueOnce(false);
      totpService.createSetupChallenge.mockResolvedValueOnce({
        challengeToken: 'setup-token',
        otpauthUrl: 'otpauth://...',
      });

      const result = await service.login(dto);

      expect(totpService.createSetupChallenge).toHaveBeenCalledWith('id', 'test@test.com');
      expect(result).toEqual({ challenge: 'totp_setup_required', challenge_token: 'setup-token', otpauthUrl: 'otpauth://...' });
    });
  });
});
