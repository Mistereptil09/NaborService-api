import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { SessionService } from '../session.service';
import { UserSession } from '../../../common/entities/user-session.entity';

describe('SessionService', () => {
  let service: SessionService;
  let repo: Repository<UserSession>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: getRepositoryToken(UserSession),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    repo = module.get<Repository<UserSession>>(getRepositoryToken(UserSession));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('should create and save a session', async () => {
      const params = {
        userId: 'user-id',
        refreshTokenHash: 'hash',
        deviceName: 'device',
        ipAddress: '127.0.0.1',
        userAgent: 'agent',
        expiresAt: new Date(),
      };

      const mockSession = { id: 'session-id', ...params };
      mockRepository.create.mockReturnValueOnce(mockSession);
      mockRepository.save.mockResolvedValueOnce(mockSession);

      const result = await service.createSession(params);

      expect(repo.create).toHaveBeenCalledWith(params);
      expect(repo.save).toHaveBeenCalledWith(mockSession);
      expect(result).toEqual(mockSession);
    });
  });

  describe('findActiveByUser', () => {
    it('should fetch active sessions ordered by lastUsedAt DESC', async () => {
      const mockSessions = [{ id: '1' }, { id: '2' }];
      mockRepository.find.mockResolvedValueOnce(mockSessions);

      const result = await service.findActiveByUser('user-id');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-id',
            revokedAt: IsNull(),
            expiresAt: expect.any(Object), // MoreThan FindOperator
          },
          order: { lastUsedAt: 'DESC' },
        }),
      );
      expect(result).toEqual(mockSessions);
    });
  });

  describe('findByTokenHash', () => {
    it('should find session by token hash', async () => {
      const mockSession = { id: '1', refreshTokenHash: 'hash' };
      mockRepository.findOne.mockResolvedValueOnce(mockSession);

      const result = await service.findByTokenHash('hash');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { refreshTokenHash: 'hash' },
      });
      expect(result).toEqual(mockSession);
    });
  });

  describe('revokeSession', () => {
    it('should set revokedAt to current timestamp', async () => {
      await service.revokeSession('session-id');
      expect(repo.update).toHaveBeenCalledWith(
        'session-id',
        expect.objectContaining({
          revokedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('revokeAllUserSessions', () => {
    it('should update all active user sessions', async () => {
      await service.revokeAllUserSessions('user-id');
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-id',
          revokedAt: IsNull(),
          expiresAt: expect.any(Object),
        }),
        expect.objectContaining({
          revokedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('updateLastUsed', () => {
    it('should update refresh token hash and last used date', async () => {
      await service.updateLastUsed('session-id', 'new-hash');
      expect(repo.update).toHaveBeenCalledWith(
        'session-id',
        expect.objectContaining({
          refreshTokenHash: 'new-hash',
          lastUsedAt: expect.any(Date),
        }),
      );
    });
  });
});
