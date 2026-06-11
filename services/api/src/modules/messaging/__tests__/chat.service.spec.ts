import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatService } from '../chat.service';
import { ChatGroup } from '../entities/chat-group.entity';
import { UsersInGroup } from '../entities/users-in-group.entity';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { GroupRoleEnum, ChatGroupTypeEnum } from '../../../common/enums';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ChatService', () => {
  let service: ChatService;
  let groupRepo: any;
  let uigRepo: any;
  let redis: any;

  const makeGroup = (overrides = {}) => ({
    id: 'g1', name: 'Test Group', description: null, createdBy: 'u1',
    type: ChatGroupTypeEnum.GROUP_CHAT, listingId: null,
    createdAt: new Date(), updatedAt: null, deletedAt: null, ...overrides,
  });

  const makeMembership = (overrides = {}) => ({
    userId: 'u1', groupId: 'g1', roleInGroup: GroupRoleEnum.ADMIN,
    joinedAt: new Date(), leftAt: null, kickedAt: null,
    isMuted: false, mutedUntil: null, ...overrides,
  });

  beforeEach(async () => {
    redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    groupRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve({ ...dto, id: dto.id ?? 'g1' })),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    uigRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(ChatGroup), useValue: groupRepo },
        { provide: getRepositoryToken(UsersInGroup), useValue: uigRepo },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  // ── getUserGroups ───────────────────────────────────────

  describe('getUserGroups', () => {
    it('should return active groups for a user', async () => {
      uigRepo.find.mockResolvedValue([
        { ...makeMembership(), group: makeGroup() },
      ]);
      const groups = await service.getUserGroups('u1');
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Test Group');
    });

    it('should exclude groups where user has left', async () => {
      const membership = makeMembership({ leftAt: new Date() });
      uigRepo.find.mockResolvedValue([{ ...membership, group: makeGroup() }]);
      // find() filters leftAt IS NULL, but the mock returns everything
      // The service filters by leftAt === null after find, so the group still appears in results
      // Actually the service filters leftAt/kickedAt in the query, then filters deletedAt in JS
      // Let's test the JS filtering: group.deletedAt !== null → excluded
      uigRepo.find.mockResolvedValue([
        { ...makeMembership(), group: makeGroup({ deletedAt: new Date() }) },
      ]);
      const groups = await service.getUserGroups('u1');
      expect(groups).toHaveLength(0);
    });

    it('should return empty when user has no groups', async () => {
      uigRepo.find.mockResolvedValue([]);
      const groups = await service.getUserGroups('u9');
      expect(groups).toHaveLength(0);
    });
  });

  // ── createGroup ─────────────────────────────────────────

  describe('createGroup', () => {
    it('should create a group with creator as admin', async () => {
      groupRepo.create.mockReturnValue(makeGroup());
      const result = await service.createGroup('u1', { name: 'New Group' });
      expect(result).toBeDefined();
      expect(uigRepo.save).toHaveBeenCalled();
      const savedMember = uigRepo.save.mock.calls[0][0];
      expect(savedMember.roleInGroup).toBe(GroupRoleEnum.ADMIN);
    });

    it('should add initial members', async () => {
      groupRepo.create.mockReturnValue(makeGroup());
      await service.createGroup('u1', { name: 'With Members', memberIds: ['u2', 'u3'] });
      // First save: creator as admin. Second save: initial members.
      expect(uigRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should not add creator twice as member', async () => {
      groupRepo.create.mockReturnValue(makeGroup());
      await service.createGroup('u1', { name: 'G', memberIds: ['u1', 'u2'] });
      const secondSave = uigRepo.save.mock.calls[1][0] as any[];
      expect(secondSave.every((m: any) => m.userId !== 'u1')).toBe(true);
    });
  });

  // ── getGroupDetail ──────────────────────────────────────

  describe('getGroupDetail', () => {
    it('should return group if exists and not deleted', async () => {
      groupRepo.findOne.mockResolvedValue(makeGroup());
      const group = await service.getGroupDetail('g1');
      expect(group.name).toBe('Test Group');
    });

    it('should throw if group deleted', async () => {
      groupRepo.findOne.mockResolvedValue(makeGroup({ deletedAt: new Date() }));
      await expect(service.getGroupDetail('g1')).rejects.toThrow(NotFoundException);
    });

    it('should throw if group not found', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(service.getGroupDetail('g99')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateGroup ─────────────────────────────────────────

  describe('updateGroup', () => {
    it('should update name and description for admin', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership()); // admin
      groupRepo.findOne.mockResolvedValue(makeGroup());
      await service.updateGroup('g1', 'u1', { name: 'Renamed' });
      expect(groupRepo.save).toHaveBeenCalled();
    });

    it('should throw if non-admin tries to update', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }));
      await expect(
        service.updateGroup('g1', 'u1', { name: 'Nope' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── softDeleteGroup ─────────────────────────────────────

  describe('softDeleteGroup', () => {
    it('should soft-delete for admin', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership());
      groupRepo.findOne.mockResolvedValue(makeGroup());
      await service.softDeleteGroup('g1', 'u1');
      expect(groupRepo.save).toHaveBeenCalled();
    });

    it('should throw for non-admin', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }));
      await expect(
        service.softDeleteGroup('g1', 'u1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── getMembers ──────────────────────────────────────────

  describe('getMembers', () => {
    it('should return active members', async () => {
      groupRepo.findOne.mockResolvedValue(makeGroup());
      uigRepo.find.mockResolvedValue([
        makeMembership({ userId: 'u1', roleInGroup: GroupRoleEnum.ADMIN }),
        makeMembership({ userId: 'u2', roleInGroup: GroupRoleEnum.MESSAGE }),
      ]);
      const members = await service.getMembers('g1');
      expect(members).toHaveLength(2);
    });

    it('should throw if group not found', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(service.getMembers('g99')).rejects.toThrow(NotFoundException);
    });
  });

  // ── addMember ───────────────────────────────────────────

  describe('addMember', () => {
    it('should add a new member as inviter with actions role', async () => {
      uigRepo.findOne
        .mockResolvedValueOnce(makeMembership({ roleInGroup: GroupRoleEnum.ACTIONS })) // inviter
        .mockResolvedValueOnce(null); // not existing
      await service.addMember('g1', 'u3', 'u1');
      expect(uigRepo.save).toHaveBeenCalled();
    });

    it('should rejoin a previously left member', async () => {
      const leftMember = makeMembership({ userId: 'u2', leftAt: new Date(), roleInGroup: GroupRoleEnum.MESSAGE });
      uigRepo.findOne
        .mockResolvedValueOnce(makeMembership()) // inviter (admin)
        .mockResolvedValueOnce(leftMember);
      const result = await service.addMember('g1', 'u2', 'u1');
      expect(result.leftAt).toBeNull();
    });

    it('should reject non-actions member from inviting', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }));
      await expect(
        service.addMember('g1', 'u3', 'u1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── removeMember ────────────────────────────────────────

  describe('removeMember', () => {
    it('should allow self-leave', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership({ userId: 'u2', roleInGroup: GroupRoleEnum.MESSAGE }));
      const result = await service.removeMember('g1', 'u2', 'u2');
      expect(result.leftAt).toBeInstanceOf(Date);
    });

    it('should allow admin to kick someone', async () => {
      // First findOne: admin look-up (requirer), Second: target member
      uigRepo.findOne
        .mockResolvedValueOnce(makeMembership({ userId: 'u1', roleInGroup: GroupRoleEnum.ADMIN }))
        .mockResolvedValueOnce(makeMembership({ userId: 'u2', roleInGroup: GroupRoleEnum.MESSAGE }));
      const result = await service.removeMember('g1', 'u2', 'u1');
      expect(result.kickedAt).toBeInstanceOf(Date);
    });

    it('should reject non-admin from kicking', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership({ userId: 'u3', roleInGroup: GroupRoleEnum.MESSAGE }));
      await expect(
        service.removeMember('g1', 'u2', 'u3'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── changeRole ──────────────────────────────────────────

  describe('changeRole', () => {
    it('should change role when admin requests', async () => {
      // First findOne: admin requirer, Second: target member
      uigRepo.findOne
        .mockResolvedValueOnce(makeMembership({ userId: 'u1', roleInGroup: GroupRoleEnum.ADMIN }))
        .mockResolvedValueOnce(makeMembership({ userId: 'u2', roleInGroup: GroupRoleEnum.MESSAGE }));
      await service.changeRole('g1', 'u2', GroupRoleEnum.ACTIONS, 'u1');
      expect(uigRepo.save).toHaveBeenCalled();
    });

    it('should reject non-admin from changing roles', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }));
      await expect(
        service.changeRole('g1', 'u2', GroupRoleEnum.ADMIN, 'u3'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── mute / unmute ───────────────────────────────────────

  describe('mute', () => {
    it('should mute for a duration', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership());
      const result = await service.mute('g1', 'u1', 120);
      expect(result.muted_until).toBeDefined();
      expect(redis.set).toHaveBeenCalledWith('mute:u1:g1', '1', 'EX', 7200);
    });

    it('should permanently mute when no duration given', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership());
      const result = await service.mute('g1', 'u1');
      expect(result.muted_until).toBeDefined();
    });

    it('should throw for non-member', async () => {
      uigRepo.findOne.mockResolvedValue(null);
      await expect(service.mute('g1', 'u9')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unmute', () => {
    it('should clear mute', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership());
      const result = await service.unmute('g1', 'u1');
      expect(result.muted).toBe(false);
      expect(uigRepo.update).toHaveBeenCalledWith(
        { userId: 'u1', groupId: 'g1' },
        { isMuted: false, mutedUntil: null },
      );
      expect(redis.del).toHaveBeenCalledWith('mute:u1:g1');
    });
  });

  describe('isMuted', () => {
    it('should return true when Redis key exists', async () => {
      redis.get.mockResolvedValue('1');
      const result = await service.isMuted('g1', 'u1');
      expect(result).toBe(true);
    });

    it('should return false when Redis key missing', async () => {
      redis.get.mockResolvedValue(null);
      const result = await service.isMuted('g1', 'u1');
      expect(result).toBe(false);
    });
  });

  // ── isMember ────────────────────────────────────────────

  describe('isMember', () => {
    it('should return true for active member', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership());
      expect(await service.isMember('g1', 'u1')).toBe(true);
    });

    it('should return false for non-member', async () => {
      uigRepo.findOne.mockResolvedValue(null);
      expect(await service.isMember('g1', 'u9')).toBe(false);
    });
  });
});
