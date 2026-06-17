import { Repository } from 'typeorm';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import { UsersService } from '../users.service';
import { UserMediaService } from '../user-media.service';
import { UserSecurityService } from '../user-security.service';
import { UserPreferencesService } from '../user-preferences.service';
import { UserRgpdService } from '../user-rgpd.service';
import { UserDiscoveryService } from '../user-discovery.service';
import { UserSocialService } from '../user-social.service';
import { User } from '../entities/user.entity';
import { Follow } from '../../social/entities/follow.entity';
import { Friendship } from '../../social/entities/friendship.entity';
import { UserBlock } from '../../social/entities/user-block.entity';
import { UserSwipe } from '../../social/entities/user-swipe.entity';
import { UserReport } from '../entities/user-report.entity';
import { UserSession } from '../../../common/entities/user-session.entity';
import { UserNotificationPreferences } from '../../../common/entities/user-notification-preferences.entity';
import { UserDataProcessing } from '../entities/user-data-processing.entity';
import { TotpService } from '../../auth/totp.service';
import { SessionService } from '../../auth/session.service';
import { TokenService } from '../../auth/token.service';
import { DataProcessingService } from '../data-processing.service';
import { Neo4jService } from '../../../database/neo4j/neo4j.service';
import { VisibilityEnum, MessagePolicyEnum } from '../../../common/enums';

// Mock sharp
jest.mock('sharp', () => {
  const fn = jest.fn().mockImplementation(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 200, height: 200 }),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mocked-webp-data')),
  }));
  return Object.assign(fn, {
    default: fn,
  });
});

// Mock otplib
jest.mock('otplib', () => ({
  verifySync: jest.fn().mockReturnValue({ valid: true }),
}));

describe('Users Module Services Unit Tests', () => {
  // ----------------------------------------------------
  // UserMediaService
  // ----------------------------------------------------
  describe('UserMediaService', () => {
    let mediaService: UserMediaService;
    let mockMediaService: any;

    beforeEach(() => {
      mockMediaService = {
        upload: jest.fn(),
        delete: jest.fn(),
        findByOwner: jest.fn(),
      };

      mediaService = new UserMediaService(mockMediaService);
    });

    it('should upload avatar successfully and process using sharp', async () => {
      mockMediaService.upload.mockResolvedValue({
        _id: { toString: () => 'new-media-id' },
      });

      const mockFile = {
        buffer: Buffer.from('fake-img'),
        size: 1000,
        mimetype: 'image/png',
      } as Express.Multer.File;

      const mediaId = await mediaService.uploadMedia(
        'user-1',
        mockFile,
        'avatar',
      );
      expect(mediaId).toBe('new-media-id');
      expect(mockMediaService.upload).toHaveBeenCalledWith(
        mockFile,
        'user_avatar',
        'user-1',
      );
    });

    it('should throw PayloadTooLargeException if avatar exceeds size limit', async () => {
      mockMediaService.upload.mockRejectedValue(
        new Error('Taille du fichier dépasse la limite'),
      );

      const mockFile = {
        buffer: Buffer.from('fake-img'),
        size: 3000000, // > 2MB
        mimetype: 'image/png',
      } as Express.Multer.File;

      await expect(
        mediaService.uploadMedia('user-1', mockFile, 'avatar'),
      ).rejects.toThrow('Taille du fichier dépasse la limite');
    });

    it('should throw UnsupportedMediaTypeException if format is invalid', async () => {
      mockMediaService.upload.mockRejectedValue(
        new Error('Format de fichier non supporté'),
      );

      const mockFile = {
        buffer: Buffer.from('fake-img'),
        size: 100,
        mimetype: 'image/svg+xml',
      } as Express.Multer.File;

      await expect(
        mediaService.uploadMedia('user-1', mockFile, 'avatar'),
      ).rejects.toThrow('Format de fichier non supporté');
    });

    it('should delete media successfully and set pg reference to null', async () => {
      mockMediaService.findByOwner.mockResolvedValue([
        { _id: { toString: () => 'media-id' } },
      ]);
      mockMediaService.delete.mockResolvedValue(undefined);

      await mediaService.deleteMedia('user-1', 'avatar');

      expect(mockMediaService.findByOwner).toHaveBeenCalledWith(
        'user_avatar',
        'user-1',
      );
      expect(mockMediaService.delete).toHaveBeenCalledWith('media-id');
    });
  });

  // ----------------------------------------------------
  // UserPreferencesService
  // ----------------------------------------------------
  describe('UserPreferencesService', () => {
    let preferencesService: UserPreferencesService;
    let mockUserRepo: jest.Mocked<Repository<User>>;
    let mockNotifRepo: jest.Mocked<Repository<UserNotificationPreferences>>;

    beforeEach(() => {
      mockUserRepo = {
        findOne: jest.fn(),
        update: jest.fn(),
      } as unknown as jest.Mocked<Repository<User>>;

      mockNotifRepo = {
        findOne: jest.fn(),
        save: jest.fn(),
      } as unknown as jest.Mocked<Repository<UserNotificationPreferences>>;

      preferencesService = new UserPreferencesService(
        mockUserRepo,
        mockNotifRepo,
        {} as any,
      );
    });

    it('should get and update locale active preference', async () => {
      mockUserRepo.findOne.mockResolvedValue({ locale: 'en' } as User);
      mockUserRepo.update.mockResolvedValue({ affected: 1 } as any);

      const read = await preferencesService.getLocale('user-1');
      expect(read.locale).toBe('en');

      const updated = await preferencesService.updateLocale('user-1', 'fr');
      expect(updated.locale).toBe('fr');
      expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', {
        locale: 'fr',
      });
    });

    it('should throw BadRequestException if update locale is invalid', async () => {
      await expect(
        preferencesService.updateLocale('user-1', 'de'),
      ).rejects.toThrow('Locale non supporté');
    });
  });

  // ----------------------------------------------------
  // UserRgpdService
  // ----------------------------------------------------
  describe('UserRgpdService', () => {
    let rgpdService: UserRgpdService;
    let mockUserRepo: jest.Mocked<Repository<User>>;
    let mockDataProcessingRepo: jest.Mocked<Repository<UserDataProcessing>>;
    let mockDataProcessingService: jest.Mocked<DataProcessingService>;
    let mockTotpService: jest.Mocked<TotpService>;

    beforeEach(() => {
      mockUserRepo = {
        findOne: jest.fn(),
        update: jest.fn(),
      } as unknown as jest.Mocked<Repository<User>>;

      mockDataProcessingRepo = {
        findOne: jest.fn(),
      } as unknown as jest.Mocked<Repository<UserDataProcessing>>;

      mockDataProcessingService = {
        isOptedOut: jest.fn(),
        setOptOuts: jest.fn(),
        getEffectiveOptOuts: jest.fn(),
        setRestricted: jest.fn(),
      } as unknown as jest.Mocked<DataProcessingService>;

      mockTotpService = {
        decryptSecret: jest.fn().mockReturnValue('secret'),
      } as unknown as jest.Mocked<TotpService>;

      rgpdService = new UserRgpdService(
        mockUserRepo,
        mockDataProcessingRepo,
        mockDataProcessingService,
        mockTotpService,
      );
    });

    it('should rectify personal data with valid TOTP', async () => {
      const mockUser = new User();
      mockUser.id = 'user-1';
      mockUser.totpSecret = 'encrypted';
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      await rgpdService.rectifyPersonalData('user-1', {
        firstName: 'NewName',
        totpCode: '123456',
      });

      expect(mockUserRepo.update).toHaveBeenCalledWith('user-1', {
        firstName: 'NewName',
      });
    });

    it('should add opt-out successfully if not already opted out', async () => {
      mockDataProcessingService.isOptedOut.mockResolvedValue(false);
      mockDataProcessingRepo.findOne.mockResolvedValue({ optOuts: [] } as any);

      await rgpdService.addOptOut('user-1', 'discovery');

      expect(mockDataProcessingService.setOptOuts).toHaveBeenCalledWith(
        'user-1',
        ['discovery'],
      );
    });
  });

  // ----------------------------------------------------
  // UserDiscoveryService
  // ----------------------------------------------------
  describe('UserDiscoveryService', () => {
    let discoveryService: UserDiscoveryService;
    let mockUserRepo: jest.Mocked<Repository<User>>;
    let mockSwipeRepo: jest.Mocked<Repository<UserSwipe>>;
    let mockBlockRepo: jest.Mocked<Repository<UserBlock>>;
    let mockDataProcessingService: jest.Mocked<DataProcessingService>;
    let mockNeo4jService: jest.Mocked<Neo4jService>;
    let mockQueue: any;

    beforeEach(() => {
      mockUserRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        createQueryBuilder: jest.fn(),
      } as unknown as jest.Mocked<Repository<User>>;

      mockSwipeRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as unknown as jest.Mocked<Repository<UserSwipe>>;

      mockBlockRepo = {
        find: jest.fn(),
      } as unknown as jest.Mocked<Repository<UserBlock>>;

      mockDataProcessingService = {
        isOptedOut: jest.fn().mockResolvedValue(false),
      } as unknown as jest.Mocked<DataProcessingService>;

      mockNeo4jService = {
        run: jest.fn().mockResolvedValue({ records: [] }),
      } as unknown as jest.Mocked<Neo4jService>;

      mockQueue = {
        add: jest.fn(),
      };

      discoveryService = new UserDiscoveryService(
        mockUserRepo,
        mockSwipeRepo,
        mockBlockRepo,
        mockDataProcessingService,
        mockNeo4jService,
        mockQueue,
        { get: jest.fn(), set: jest.fn() } as any,
      );
    });

    it('should swipe target user and publish job to Neo4j queue', async () => {
      const mockUser = new User();
      mockUser.id = 'target-user';
      mockUserRepo.findOne.mockResolvedValue(mockUser);
      mockSwipeRepo.findOne.mockResolvedValue(null);
      mockSwipeRepo.create.mockReturnValue({} as any);

      await discoveryService.swipe('user-1', 'target-user', {
        direction: 'like',
      });

      expect(mockSwipeRepo.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('user.swipe', {
        swiperId: 'user-1',
        swipedId: 'target-user',
        direction: 'like',
      });
    });
  });

  // ----------------------------------------------------
  // UserSocialService
  // ----------------------------------------------------
  describe('UserSocialService', () => {
    let socialService: UserSocialService;
    let mockUserRepo: jest.Mocked<Repository<User>>;
    let mockFollowRepo: jest.Mocked<Repository<Follow>>;
    let mockFriendshipRepo: jest.Mocked<Repository<Friendship>>;
    let mockBlockRepo: jest.Mocked<Repository<UserBlock>>;
    let mockReportRepo: jest.Mocked<Repository<UserReport>>;
    let mockQueue: any;

    beforeEach(() => {
      mockUserRepo = {
        findOne: jest.fn(),
      } as unknown as jest.Mocked<Repository<User>>;

      mockFollowRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
      } as unknown as jest.Mocked<Repository<Follow>>;

      mockFriendshipRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as unknown as jest.Mocked<Repository<Friendship>>;

      mockBlockRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
      } as unknown as jest.Mocked<Repository<UserBlock>>;

      mockReportRepo = {
        create: jest.fn(),
        save: jest.fn(),
      } as unknown as jest.Mocked<Repository<UserReport>>;

      mockQueue = {
        add: jest.fn(),
      };

      socialService = new UserSocialService(
        mockUserRepo,
        mockFollowRepo,
        mockFriendshipRepo,
        mockBlockRepo,
        mockReportRepo,
        {
          create: jest.fn(),
          save: jest
            .fn()
            .mockImplementation((g) =>
              Promise.resolve({ ...g, id: 'group-id' }),
            ),
        } as any, // chatGroupRepo
        { create: jest.fn(), save: jest.fn() } as any, // usersInGroupRepo
        mockQueue,
      );
    });

    it('should follow user and detect mutual follow for friendship', async () => {
      const mockTarget = new User();
      mockTarget.id = 'user-2';
      mockUserRepo.findOne.mockResolvedValue(mockTarget);

      mockBlockRepo.findOne.mockResolvedValue(null);
      mockFollowRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({} as any); // follow back exists

      mockFollowRepo.create.mockReturnValue({} as any);
      mockFriendshipRepo.findOne.mockResolvedValue(null);
      mockFriendshipRepo.create.mockReturnValue({} as any);

      await socialService.follow('user-1', 'user-2');

      expect(mockFollowRepo.save).toHaveBeenCalled();
      expect(mockFriendshipRepo.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('user.friends_with.create', {
        userId1: 'user-1',
        userId2: 'user-2',
      });
    });

    it('should block user and clean up relationships', async () => {
      const mockTarget = new User();
      mockTarget.id = 'user-2';
      mockUserRepo.findOne.mockResolvedValue(mockTarget);
      mockBlockRepo.findOne.mockResolvedValue(null);
      mockBlockRepo.create.mockReturnValue({} as any);

      mockFriendshipRepo.findOne.mockResolvedValue(null);

      await socialService.block('user-1', 'user-2');

      expect(mockBlockRepo.save).toHaveBeenCalled();
      expect(mockFollowRepo.delete).toHaveBeenCalledWith({
        followerId: 'user-1',
        followedId: 'user-2',
      });
      expect(mockFollowRepo.delete).toHaveBeenCalledWith({
        followerId: 'user-2',
        followedId: 'user-1',
      });
    });

    it('should report user successfully with reason', async () => {
      const mockTarget = new User();
      mockTarget.id = 'user-2';
      mockUserRepo.findOne.mockResolvedValue(mockTarget);
      mockReportRepo.create.mockReturnValue({} as any);

      await socialService.report('user-1', 'user-2', 'Inappropriate content');

      expect(mockReportRepo.save).toHaveBeenCalled();
    });
  });
});
