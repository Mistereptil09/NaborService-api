import { UsersService } from '../users.service';
import { UserRoleEnum, VisibilityEnum } from '../../../common/enums';

describe('UsersService — neighbourhood chat group sync hooks', () => {
  let service: UsersService;
  let userRepository: any;
  let chatService: any;
  let neo4jSyncQueue: any;

  const baseUser = {
    id: 'u1',
    email: 'u1@nabor.fr',
    role: UserRoleEnum.RESIDENT,
    visibility: VisibilityEnum.PUBLIC,
    neighbourhoodId: 'nb-old',
  };

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn().mockResolvedValue({ ...baseUser }),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
    };
    chatService = {
      syncResidentNeighbourhoodMembership: jest
        .fn()
        .mockResolvedValue(undefined),
      resyncNeighbourhoodGroupMembershipForRoleChange: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    neo4jSyncQueue = { add: jest.fn().mockResolvedValue(undefined) };

    service = new UsersService(
      userRepository,
      null as any, // followRepository
      null as any, // totpService
      null as any, // sessionService
      null as any, // userSocialService
      chatService,
      neo4jSyncQueue,
      null as any, // rgpdAnonymiseQueue
    );
  });

  describe('updateProfile', () => {
    it('should sync resident membership when a resident changes neighbourhood', async () => {
      await service.updateProfile('u1', { neighbourhoodId: 'nb-new' });

      expect(
        chatService.syncResidentNeighbourhoodMembership,
      ).toHaveBeenCalledWith('u1', 'nb-old', 'nb-new', expect.anything());
    });

    it('should not sync when the neighbourhood is unchanged', async () => {
      await service.updateProfile('u1', { neighbourhoodId: 'nb-old' });
      expect(
        chatService.syncResidentNeighbourhoodMembership,
      ).not.toHaveBeenCalled();
    });

    it('should not sync when neighbourhoodId is not provided', async () => {
      await service.updateProfile('u1', { firstName: 'New Name' });
      expect(
        chatService.syncResidentNeighbourhoodMembership,
      ).not.toHaveBeenCalled();
    });

    it('should skip resident-membership sync for staff (they get access via role sync instead)', async () => {
      userRepository.findOne.mockResolvedValue({
        ...baseUser,
        role: UserRoleEnum.MODERATOR,
      });
      await service.updateProfile('u1', { neighbourhoodId: 'nb-new' });
      expect(
        chatService.syncResidentNeighbourhoodMembership,
      ).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('should resync neighbourhood group membership when the role actually changes', async () => {
      userRepository.findOne.mockResolvedValue({
        ...baseUser,
        role: UserRoleEnum.RESIDENT,
      });

      await service.updateRole('u1', UserRoleEnum.MODERATOR);

      expect(
        chatService.resyncNeighbourhoodGroupMembershipForRoleChange,
      ).toHaveBeenCalledWith(
        'u1',
        UserRoleEnum.RESIDENT,
        UserRoleEnum.MODERATOR,
        'nb-old',
      );
    });

    it('should not resync when the role is unchanged', async () => {
      userRepository.findOne.mockResolvedValue({
        ...baseUser,
        role: UserRoleEnum.RESIDENT,
      });

      await service.updateRole('u1', UserRoleEnum.RESIDENT);

      expect(
        chatService.resyncNeighbourhoodGroupMembershipForRoleChange,
      ).not.toHaveBeenCalled();
    });
  });
});
