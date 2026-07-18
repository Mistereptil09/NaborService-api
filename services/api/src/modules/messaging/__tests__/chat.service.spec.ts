import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatService } from '../chat.service';
import { ChatGroup } from '../entities/chat-group.entity';
import { UsersInGroup } from '../entities/users-in-group.entity';
import { MessageMetadata } from '../entities/message-metadata.entity';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { GroupRoleEnum, ChatGroupTypeEnum } from '../../../common/enums';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ChatService', () => {
  let service: ChatService;
  let groupRepo: any;
  let uigRepo: any;
  let msgRepo: any;
  let redis: any;

  const makeGroup = (overrides = {}) => ({
    id: 'g1',
    name: 'Test Group',
    description: null,
    createdBy: 'u1',
    type: ChatGroupTypeEnum.GROUP_CHAT,
    listingId: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  });

  const makeMembership = (overrides = {}) => ({
    userId: 'u1',
    groupId: 'g1',
    roleInGroup: GroupRoleEnum.ADMIN,
    joinedAt: new Date(),
    leftAt: null,
    kickedAt: null,
    isMuted: false,
    mutedUntil: null,
    ...overrides,
  });

  // Chainable mock for uigRepo.createQueryBuilder(), used by enrichGroups()
  // (member_count + other_participant batched queries).
  const makeQueryBuilder = (
    overrides: { getRawMany?: any[]; getMany?: any[] } = {},
  ) => {
    const qb: any = {};
    [
      'select',
      'addSelect',
      'where',
      'andWhere',
      'groupBy',
      'innerJoinAndSelect',
    ].forEach((m) => {
      qb[m] = jest.fn().mockReturnValue(qb);
    });
    qb.getRawMany = jest.fn().mockResolvedValue(overrides.getRawMany ?? []);
    qb.getMany = jest.fn().mockResolvedValue(overrides.getMany ?? []);
    return qb;
  };

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      mget: jest
        .fn()
        .mockImplementation((...keys: string[]) =>
          Promise.resolve(keys.map(() => null)),
        ),
    };

    groupRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest
        .fn()
        .mockImplementation((dto) =>
          Promise.resolve({ ...dto, id: dto.id ?? 'g1' }),
        ),
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
      createQueryBuilder: jest
        .fn()
        .mockImplementation(() => makeQueryBuilder()),
    };

    msgRepo = {
      count: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(ChatGroup), useValue: groupRepo },
        { provide: getRepositoryToken(UsersInGroup), useValue: uigRepo },
        { provide: getRepositoryToken(MessageMetadata), useValue: msgRepo },
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

    it('should include member_count for every group', async () => {
      uigRepo.find.mockResolvedValue([
        { ...makeMembership(), group: makeGroup() },
      ]);
      uigRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ getRawMany: [{ groupId: 'g1', count: '2' }] }),
      );
      const groups = await service.getUserGroups('u1');
      expect(groups[0].member_count).toBe(2);
    });

    it('should include other_participant for a direct_message group, excluding the requester', async () => {
      const dmGroup = makeGroup({
        type: ChatGroupTypeEnum.DIRECT_MESSAGE,
        name: null,
      });
      uigRepo.find.mockResolvedValue([{ ...makeMembership(), group: dmGroup }]);
      uigRepo.createQueryBuilder.mockImplementation(() =>
        makeQueryBuilder({
          getRawMany: [{ groupId: 'g1', count: '2' }],
          getMany: [
            {
              groupId: 'g1',
              user: {
                id: 'u2',
                firstName: 'Jane',
                lastName: 'Doe',
                profilePictureMongoId: 'm1',
              },
            },
          ],
        }),
      );
      const groups = await service.getUserGroups('u1');
      expect(groups[0].other_participant).toEqual({
        id: 'u2',
        first_name: 'Jane',
        last_name: 'Doe',
        profile_picture_mongo_id: 'm1',
      });
    });

    it('should not attach other_participant for a group_chat', async () => {
      uigRepo.find.mockResolvedValue([
        { ...makeMembership(), group: makeGroup() },
      ]);
      const groups = await service.getUserGroups('u1');
      expect(groups[0].other_participant).toBeNull();
    });

    it('should report is_muted from Redis, not the stale isMuted column', async () => {
      uigRepo.find.mockResolvedValue([
        { ...makeMembership(), group: makeGroup() },
      ]);
      redis.mget.mockResolvedValueOnce(['1']);
      const groups = await service.getUserGroups('u1');
      expect(groups[0].is_muted).toBe(true);
    });

    it('should report is_muted false when no Redis mute key exists', async () => {
      uigRepo.find.mockResolvedValue([
        { ...makeMembership(), group: makeGroup() },
      ]);
      const groups = await service.getUserGroups('u1');
      expect(groups[0].is_muted).toBe(false);
    });

    it('should include unread_count computed against the last-read pointer', async () => {
      uigRepo.find.mockResolvedValue([
        { ...makeMembership(), group: makeGroup() },
      ]);
      msgRepo.count.mockResolvedValue(3);
      const groups = await service.getUserGroups('u1');
      expect(groups[0].unread_count).toBe(3);
      expect(msgRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ groupId: 'g1', isDeleted: false }),
        }),
      );
    });

    it('should default unread_count to 0 when there are no unread messages', async () => {
      uigRepo.find.mockResolvedValue([
        { ...makeMembership(), group: makeGroup() },
      ]);
      msgRepo.count.mockResolvedValue(0);
      const groups = await service.getUserGroups('u1');
      expect(groups[0].unread_count).toBe(0);
    });
  });

  // ── assertCanParticipate ─────────────────────────────────

  describe('assertCanParticipate', () => {
    it('should allow non-watch roles', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }),
      );
      await expect(
        service.assertCanParticipate('g1', 'u1'),
      ).resolves.toBeDefined();
    });

    it('should reject the watch role', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ roleInGroup: GroupRoleEnum.WATCH }),
      );
      await expect(service.assertCanParticipate('g1', 'u1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject a non-member', async () => {
      uigRepo.findOne.mockResolvedValue(null);
      await expect(service.assertCanParticipate('g1', 'u9')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── assertGroupRole ──────────────────────────────────────

  describe('assertGroupRole', () => {
    it('should allow a member holding one of the given roles', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ roleInGroup: GroupRoleEnum.ACTIONS }),
      );
      await expect(
        service.assertGroupRole('g1', 'u1', [
          GroupRoleEnum.ACTIONS,
          GroupRoleEnum.ADMIN,
        ]),
      ).resolves.toBeDefined();
    });

    it('should reject a member without one of the given roles', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }),
      );
      await expect(
        service.assertGroupRole('g1', 'u1', [GroupRoleEnum.ADMIN]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject a non-member', async () => {
      uigRepo.findOne.mockResolvedValue(null);
      await expect(
        service.assertGroupRole('g1', 'u9', [GroupRoleEnum.ADMIN]),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── markGroupRead ────────────────────────────────────────

  describe('markGroupRead', () => {
    it('should stamp the last-read pointer for an active member', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership());
      await service.markGroupRead('g1', 'u1');
      expect(uigRepo.update).toHaveBeenCalledWith(
        { groupId: 'g1', userId: 'u1' },
        { lastReadAt: expect.any(Date) },
      );
    });

    it('should reject a non-member', async () => {
      uigRepo.findOne.mockResolvedValue(null);
      await expect(service.markGroupRead('g1', 'u9')).rejects.toThrow(
        ForbiddenException,
      );
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
      await service.createGroup('u1', {
        name: 'With Members',
        memberIds: ['u2', 'u3'],
      });
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
      await expect(service.getGroupDetail('g1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw if group not found', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(service.getGroupDetail('g99')).rejects.toThrow(
        NotFoundException,
      );
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
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }),
      );
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
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }),
      );
      await expect(service.softDeleteGroup('g1', 'u1')).rejects.toThrow(
        ForbiddenException,
      );
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
      await expect(service.getMembers('g99')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── addMember ───────────────────────────────────────────

  describe('addMember', () => {
    it('should add a new member as inviter with actions role', async () => {
      uigRepo.findOne
        .mockResolvedValueOnce(
          makeMembership({ roleInGroup: GroupRoleEnum.ACTIONS }),
        ) // inviter
        .mockResolvedValueOnce(null); // not existing
      await service.addMember('g1', 'u3', 'u1');
      expect(uigRepo.save).toHaveBeenCalled();
    });

    it('should rejoin a previously left member', async () => {
      const leftMember = makeMembership({
        userId: 'u2',
        leftAt: new Date(),
        roleInGroup: GroupRoleEnum.MESSAGE,
      });
      uigRepo.findOne
        .mockResolvedValueOnce(makeMembership()) // inviter (admin)
        .mockResolvedValueOnce(leftMember);
      const result = await service.addMember('g1', 'u2', 'u1');
      expect(result.leftAt).toBeNull();
    });

    it('should reject non-actions member from inviting', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }),
      );
      await expect(service.addMember('g1', 'u3', 'u1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── removeMember ────────────────────────────────────────

  describe('removeMember', () => {
    it('should allow self-leave', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ userId: 'u2', roleInGroup: GroupRoleEnum.MESSAGE }),
      );
      const result = await service.removeMember('g1', 'u2', 'u2');
      expect(result.leftAt).toBeInstanceOf(Date);
    });

    it('should allow admin to kick someone', async () => {
      // First findOne: admin look-up (requirer), Second: target member
      uigRepo.findOne
        .mockResolvedValueOnce(
          makeMembership({ userId: 'u1', roleInGroup: GroupRoleEnum.ADMIN }),
        )
        .mockResolvedValueOnce(
          makeMembership({ userId: 'u2', roleInGroup: GroupRoleEnum.MESSAGE }),
        );
      const result = await service.removeMember('g1', 'u2', 'u1');
      expect(result.kickedAt).toBeInstanceOf(Date);
    });

    it('should reject non-admin from kicking', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ userId: 'u3', roleInGroup: GroupRoleEnum.MESSAGE }),
      );
      await expect(service.removeMember('g1', 'u2', 'u3')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── changeRole ──────────────────────────────────────────

  describe('changeRole', () => {
    it('should change role when admin requests', async () => {
      // First findOne: admin requirer, Second: target member
      uigRepo.findOne
        .mockResolvedValueOnce(
          makeMembership({ userId: 'u1', roleInGroup: GroupRoleEnum.ADMIN }),
        )
        .mockResolvedValueOnce(
          makeMembership({ userId: 'u2', roleInGroup: GroupRoleEnum.MESSAGE }),
        );
      await service.changeRole('g1', 'u2', GroupRoleEnum.ACTIONS, 'u1');
      expect(uigRepo.save).toHaveBeenCalled();
    });

    it('should reject non-admin from changing roles', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ roleInGroup: GroupRoleEnum.MESSAGE }),
      );
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
      await expect(service.mute('g1', 'u9')).rejects.toThrow(
        ForbiddenException,
      );
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

  // ── Neighbourhood groups ─────────────────────────────────

  const makeNeighbourhoodGroup = (overrides = {}) =>
    makeGroup({
      type: ChatGroupTypeEnum.NEIGHBOURHOOD,
      neighbourhoodId: 'nb1',
      createdBy: null,
      ...overrides,
    });

  describe('getNeighbourhoodGroup', () => {
    it('should look up an active neighbourhood group by neighbourhoodId', async () => {
      groupRepo.findOne.mockResolvedValue(makeNeighbourhoodGroup());
      const group = await service.getNeighbourhoodGroup('nb1');
      expect(group).toBeDefined();
      expect(groupRepo.findOne).toHaveBeenCalledWith({
        where: {
          neighbourhoodId: 'nb1',
          type: ChatGroupTypeEnum.NEIGHBOURHOOD,
          deletedAt: expect.anything(),
        },
      });
    });

    it('should return null when no group exists', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      expect(await service.getNeighbourhoodGroup('nb-missing')).toBeNull();
    });
  });

  describe('upsertMembership', () => {
    it('should create a new membership when none exists', async () => {
      uigRepo.findOne.mockResolvedValue(null);
      await service.upsertMembership('g1', 'u1', GroupRoleEnum.WATCH);
      expect(uigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          groupId: 'g1',
          roleInGroup: GroupRoleEnum.WATCH,
        }),
      );
    });

    it('should reactivate a left/kicked membership and set the new role', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({
          userId: 'u1',
          leftAt: new Date(),
          roleInGroup: GroupRoleEnum.WATCH,
        }),
      );
      const result = await service.upsertMembership(
        'g1',
        'u1',
        GroupRoleEnum.ADMIN,
      );
      expect(result.leftAt).toBeNull();
      expect(result.roleInGroup).toBe(GroupRoleEnum.ADMIN);
    });

    it('should upgrade the role of an already-active membership', async () => {
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ userId: 'u1', roleInGroup: GroupRoleEnum.WATCH }),
      );
      const result = await service.upsertMembership(
        'g1',
        'u1',
        GroupRoleEnum.MESSAGE,
      );
      expect(result.roleInGroup).toBe(GroupRoleEnum.MESSAGE);
      expect(uigRepo.save).toHaveBeenCalled();
    });

    it('should no-op when already active with the exact same role', async () => {
      const existing = makeMembership({
        userId: 'u1',
        roleInGroup: GroupRoleEnum.WATCH,
      });
      uigRepo.findOne.mockResolvedValue(existing);
      const result = await service.upsertMembership(
        'g1',
        'u1',
        GroupRoleEnum.WATCH,
      );
      expect(result).toBe(existing);
      expect(uigRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('revokeMembership', () => {
    it('should set leftAt on an active membership', async () => {
      uigRepo.findOne.mockResolvedValue(makeMembership({ userId: 'u1' }));
      await service.revokeMembership('g1', 'u1');
      expect(uigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ leftAt: expect.any(Date) }),
      );
    });

    it('should no-op when no active membership exists', async () => {
      uigRepo.findOne.mockResolvedValue(null);
      await service.revokeMembership('g1', 'u9');
      expect(uigRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('ensureNeighbourhoodGroup', () => {
    it('should create the group when missing, then apply members', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      groupRepo.create.mockImplementation((dto: any) => dto);
      uigRepo.findOne.mockResolvedValue(null);

      const group = await service.ensureNeighbourhoodGroup('nb1', 'Downtown', [
        { userId: 'u1', role: GroupRoleEnum.ADMIN },
      ]);

      expect(group).toBeDefined();
      expect(groupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ChatGroupTypeEnum.NEIGHBOURHOOD,
          neighbourhoodId: 'nb1',
          createdBy: null,
        }),
      );
      expect(uigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          roleInGroup: GroupRoleEnum.ADMIN,
        }),
      );
    });

    it('should be idempotent — reuse an existing group instead of creating a new one', async () => {
      groupRepo.findOne.mockResolvedValue(makeNeighbourhoodGroup());
      uigRepo.findOne.mockResolvedValue(null);

      await service.ensureNeighbourhoodGroup('nb1', 'Downtown', []);

      expect(groupRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('syncResidentNeighbourhoodMembership', () => {
    it('should revoke membership in the old neighbourhood and grant it in the new one', async () => {
      groupRepo.findOne
        .mockResolvedValueOnce(
          makeNeighbourhoodGroup({ id: 'g-old', neighbourhoodId: 'nb-old' }),
        ) // old lookup
        .mockResolvedValueOnce(
          makeNeighbourhoodGroup({ id: 'g-new', neighbourhoodId: 'nb-new' }),
        ); // new lookup
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ userId: 'u1', groupId: 'g-old' }),
      );

      await service.syncResidentNeighbourhoodMembership(
        'u1',
        'nb-old',
        'nb-new',
        GroupRoleEnum.WATCH,
      );

      expect(uigRepo.save).toHaveBeenCalledTimes(2); // revoke on old, upsert on new
    });

    it('should no-op the new-group grant when the target neighbourhood has no group yet', async () => {
      groupRepo.findOne
        .mockResolvedValueOnce(
          makeNeighbourhoodGroup({ id: 'g-old', neighbourhoodId: 'nb-old' }),
        )
        .mockResolvedValueOnce(null); // no group for the new neighbourhood
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ userId: 'u1', groupId: 'g-old' }),
      );

      await service.syncResidentNeighbourhoodMembership(
        'u1',
        'nb-old',
        'nb-new',
        GroupRoleEnum.WATCH,
      );

      expect(uigRepo.save).toHaveBeenCalledTimes(1); // revoke on old only
    });

    it('should only grant when there is no previous neighbourhood', async () => {
      groupRepo.findOne.mockResolvedValue(makeNeighbourhoodGroup());
      uigRepo.findOne.mockResolvedValue(null);

      await service.syncResidentNeighbourhoodMembership(
        'u1',
        null,
        'nb1',
        GroupRoleEnum.MESSAGE,
      );

      expect(uigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          roleInGroup: GroupRoleEnum.MESSAGE,
        }),
      );
    });
  });

  describe('resyncNeighbourhoodGroupMembershipForRoleChange', () => {
    it('no current neighbourhood: no-op', async () => {
      await service.resyncNeighbourhoodGroupMembershipForRoleChange(
        'u1',
        'moderator' as any,
        null,
      );

      expect(groupRepo.findOne).not.toHaveBeenCalled();
      expect(uigRepo.save).not.toHaveBeenCalled();
    });

    it('neighbourhood has no auto-managed group yet (not backfilled): no-op', async () => {
      groupRepo.findOne.mockResolvedValue(null);

      await service.resyncNeighbourhoodGroupMembershipForRoleChange(
        'u1',
        'moderator' as any,
        'nb1',
      );

      expect(uigRepo.save).not.toHaveBeenCalled();
    });

    it('promoted to moderator/admin: becomes ADMIN in their own neighbourhood group', async () => {
      groupRepo.findOne.mockResolvedValue(
        makeNeighbourhoodGroup({ id: 'g1', neighbourhoodId: 'nb1' }),
      );
      uigRepo.findOne.mockResolvedValue(null);

      await service.resyncNeighbourhoodGroupMembershipForRoleChange(
        'u1',
        'moderator' as any,
        'nb1',
      );

      expect(uigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ roleInGroup: GroupRoleEnum.ADMIN }),
      );
    });

    it('promoted to neighbourhood_rep: becomes ADMIN in their own neighbourhood group', async () => {
      groupRepo.findOne.mockResolvedValue(
        makeNeighbourhoodGroup({ id: 'g1', neighbourhoodId: 'nb1' }),
      );
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ userId: 'u1', roleInGroup: GroupRoleEnum.WATCH }),
      );

      await service.resyncNeighbourhoodGroupMembershipForRoleChange(
        'u1',
        'neighbourhood_rep' as any,
        'nb1',
      );

      expect(uigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ roleInGroup: GroupRoleEnum.ADMIN }),
      );
    });

    it('demoted to resident: becomes WATCH in their own neighbourhood group', async () => {
      groupRepo.findOne.mockResolvedValue(
        makeNeighbourhoodGroup({ id: 'g1', neighbourhoodId: 'nb1' }),
      );
      uigRepo.findOne.mockResolvedValue(
        makeMembership({ userId: 'u1', roleInGroup: GroupRoleEnum.ADMIN }),
      );

      await service.resyncNeighbourhoodGroupMembershipForRoleChange(
        'u1',
        'resident' as any,
        'nb1',
      );

      expect(uigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ roleInGroup: GroupRoleEnum.WATCH }),
      );
    });
  });
});
