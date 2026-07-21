import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PollsService } from '../polls.service';
import { Poll } from '../entities/poll.entity';
import { PollOption } from '../entities/poll-option.entity';
import { Vote } from '../entities/vote.entity';
import { User } from '../../users/entities/user.entity';
import { PollTypeEnum } from '../../../common/enums';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PollsService', () => {
  let service: PollsService;
  let pollRepo: any;
  let optionRepo: any;
  let voteRepo: any;
  let userRepo: any;

  const makePoll = (overrides = {}) => ({
    id: 'p1',
    title: 'Test Poll',
    description: null,
    creatorId: 'u1',
    neighbourhoodId: 'nb1',
    groupId: null,
    pollType: PollTypeEnum.SINGLE,
    isAnonymous: false,
    startsAt: null,
    endsAt: null,
    closedAt: null,
    closedBy: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    options: [],
    ...overrides,
  });

  beforeEach(async () => {
    pollRepo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve({ ...d, id: d.id ?? 'p1' })),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
    };
    optionRepo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve(d)),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    voteRepo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve(d)),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    userRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PollsService,
        { provide: getRepositoryToken(Poll), useValue: pollRepo },
        { provide: getRepositoryToken(PollOption), useValue: optionRepo },
        { provide: getRepositoryToken(Vote), useValue: voteRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(PollsService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  // ── listPolls ───────────────────────────────────────────

  describe('listPolls', () => {
    it('should return non-deleted polls (closed polls stay visible)', async () => {
      pollRepo.find.mockResolvedValue([makePoll()]);
      const polls = await service.listPolls();
      expect(polls).toHaveLength(1);
      // Seuls les supprimés sont masqués — pas de filtre sur closedAt.
      const where = pollRepo.find.mock.calls[0][0].where;
      expect(where.deletedAt).toBeDefined();
      expect(where.closedAt).toBeUndefined();
    });

    it('should filter by neighbourhood', async () => {
      pollRepo.find.mockResolvedValue([]);
      await service.listPolls('nb1');
      expect(pollRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ neighbourhoodId: 'nb1' }),
        }),
      );
    });

    it('should filter by group_id, taking precedence over neighbourhood_id', async () => {
      pollRepo.find.mockResolvedValue([]);
      await service.listPolls('nb1', 'g1');
      const where = pollRepo.find.mock.calls[0][0].where;
      expect(where.groupId).toBe('g1');
      expect(where.neighbourhoodId).toBeUndefined();
    });

    it('should attach aggregated results to every poll in the list (not just single-poll getPoll)', async () => {
      pollRepo.find.mockResolvedValue([
        {
          ...makePoll(),
          options: [{ id: 'o1', label: 'Yes', pollId: 'p1', weight: 1 }],
        },
      ]);
      voteRepo.find.mockResolvedValue([
        { userId: 'u2', optionId: 'o1', weight: 2, option: { pollId: 'p1' } },
      ]);
      const [poll] = await service.listPolls();
      expect(poll.results).toBeDefined();
      expect(poll.results[0].vote_count).toBe(2);
    });
  });

  // ── createPoll ──────────────────────────────────────────

  describe('createPoll', () => {
    it('should create a neighbourhood-scoped poll', async () => {
      const p = await service.createPoll('u1', {
        title: 'Q?',
        neighbourhood_id: 'nb1',
      });
      expect(p.title).toBe('Q?');
      expect(p.creatorId).toBe('u1');
      expect(p.neighbourhoodId).toBe('nb1');
      expect(p.groupId).toBeNull();
      expect(p.isWeighted).toBe(false);
    });

    it('should create a multiple-choice AND weighted poll (independent flags)', async () => {
      const p = await service.createPoll('u1', {
        title: 'Q?',
        neighbourhood_id: 'nb1',
        poll_type: PollTypeEnum.MULTIPLE,
        is_weighted: true,
      });
      expect(p.pollType).toBe(PollTypeEnum.MULTIPLE);
      expect(p.isWeighted).toBe(true);
    });

    it('should create a group-scoped poll and ignore neighbourhood_id', async () => {
      const p = await service.createPoll('u1', {
        title: 'Q?',
        neighbourhood_id: 'nb1',
        group_id: 'g1',
      });
      expect(p.groupId).toBe('g1');
      expect(p.neighbourhoodId).toBeNull();
    });
  });

  // ── getPoll ─────────────────────────────────────────────

  describe('getPoll', () => {
    it('should return poll with results', async () => {
      pollRepo.findOne.mockResolvedValue({
        ...makePoll(),
        options: [{ id: 'o1', label: 'Yes', pollId: 'p1', weight: 1 }],
      });
      voteRepo.find.mockResolvedValue([
        { userId: 'u2', optionId: 'o1', weight: 2, option: { pollId: 'p1' } },
      ]);
      const p = await service.getPoll('p1');
      expect(p.results).toBeDefined();
      expect(p.results[0].vote_count).toBe(2);
    });

    it('should throw on missing poll', async () => {
      pollRepo.findOne.mockResolvedValue(null);
      await expect(service.getPoll('p99')).rejects.toThrow(NotFoundException);
    });

    it('should sum vote_count numerically even though pg returns the numeric weight column as a string (e.g. "1.00")', async () => {
      pollRepo.findOne.mockResolvedValue({
        ...makePoll(),
        options: [{ id: 'o1', label: 'Yes', pollId: 'p1', weight: '1.00' }],
      });
      voteRepo.find.mockResolvedValue([
        { userId: 'u1', optionId: 'o1', weight: '1.00', option: { pollId: 'p1' } },
        { userId: 'u2', optionId: 'o1', weight: '1.00', option: { pollId: 'p1' } },
      ]);
      const p = await service.getPoll('p1');
      // Bug regression: string concatenation ("0" + "1.00" + "1.00") would
      // have produced the non-numeric "01.001.00" instead of 2.
      expect(p.results[0].vote_count).toBe(2);
      expect(typeof p.results[0].vote_count).toBe('number');
    });

    it('should attach voter identities for a non-anonymous poll', async () => {
      pollRepo.findOne.mockResolvedValue({
        ...makePoll({ isAnonymous: false }),
        options: [{ id: 'o1', label: 'Yes', pollId: 'p1', weight: 1 }],
      });
      voteRepo.find.mockResolvedValue([
        { userId: 'u2', optionId: 'o1', weight: 1, option: { pollId: 'p1' } },
      ]);
      userRepo.find.mockResolvedValue([
        {
          id: 'u2',
          firstName: 'Ana',
          lastName: 'B',
          profilePictureMongoId: null,
        },
      ]);
      const p = await service.getPoll('p1');
      expect(p.results[0].voters).toEqual([
        {
          id: 'u2',
          first_name: 'Ana',
          last_name: 'B',
          profile_picture_mongo_id: null,
        },
      ]);
    });

    it('should NOT attach voter identities for an anonymous poll', async () => {
      pollRepo.findOne.mockResolvedValue({
        ...makePoll({ isAnonymous: true }),
        options: [{ id: 'o1', label: 'Yes', pollId: 'p1', weight: 1 }],
      });
      voteRepo.find.mockResolvedValue([
        { userId: 'u2', optionId: 'o1', weight: 1, option: { pollId: 'p1' } },
      ]);
      const p = await service.getPoll('p1');
      expect(p.results[0].voters).toBeUndefined();
      expect(userRepo.find).not.toHaveBeenCalled();
    });
  });

  // ── updatePoll ──────────────────────────────────────────

  describe('updatePoll', () => {
    it('should update if creator and no votes', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      voteRepo.count.mockResolvedValue(0);
      await service.updatePoll('p1', 'u1', { title: 'New' });
      expect(pollRepo.save).toHaveBeenCalled();
    });

    it('should reject after first vote', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      voteRepo.count.mockResolvedValue(1);
      await expect(
        service.updatePoll('p1', 'u1', { title: 'Nope' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-creator', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      await expect(
        service.updatePoll('p1', 'u2', { title: 'Nope' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── closePoll ───────────────────────────────────────────

  describe('closePoll', () => {
    it('should close by creator', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      const p = await service.closePoll('p1', 'u1');
      expect(p.closedAt).toBeDefined();
    });

    it('should reject if already closed', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll({ closedAt: new Date() }));
      await expect(service.closePoll('p1', 'u1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── vote ────────────────────────────────────────────────

  describe('vote', () => {
    it("should cast a vote using the option's weight, not a voter-supplied one", async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      optionRepo.findOne.mockResolvedValue({
        id: 'o1',
        pollId: 'p1',
        weight: 3,
      });
      await service.vote('p1', 'u1', 'o1');
      expect(voteRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ weight: 3 }),
      );
    });

    it('should reject on closed poll', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll({ closedAt: new Date() }));
      await expect(service.vote('p1', 'u1', 'o1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should clear prior votes for SINGLE poll', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      optionRepo.findOne.mockResolvedValue({
        id: 'o2',
        pollId: 'p1',
        weight: 1,
      });
      // Mock existing prior vote
      voteRepo.find.mockResolvedValue([
        { userId: 'u1', optionId: 'o1', option: { pollId: 'p1' } },
      ]);
      await service.vote('p1', 'u1', 'o2');
      expect(voteRepo.remove).toHaveBeenCalled();
      expect(voteRepo.save).toHaveBeenCalled(); // new vote saved
    });

    it('should clear prior votes for WEIGHTED poll too (single-select)', async () => {
      pollRepo.findOne.mockResolvedValue(
        makePoll({ pollType: PollTypeEnum.WEIGHTED }),
      );
      optionRepo.findOne.mockResolvedValue({
        id: 'o2',
        pollId: 'p1',
        weight: 5,
      });
      voteRepo.find.mockResolvedValue([
        { userId: 'u1', optionId: 'o1', option: { pollId: 'p1' } },
      ]);
      await service.vote('p1', 'u1', 'o2');
      expect(voteRepo.remove).toHaveBeenCalled();
      expect(voteRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ optionId: 'o2', weight: 5 }),
      );
    });

    it('should NOT clear prior votes for MULTIPLE poll', async () => {
      pollRepo.findOne.mockResolvedValue(
        makePoll({ pollType: PollTypeEnum.MULTIPLE }),
      );
      optionRepo.findOne.mockResolvedValue({
        id: 'o2',
        pollId: 'p1',
        weight: 1,
      });
      await service.vote('p1', 'u1', 'o2');
      expect(voteRepo.remove).not.toHaveBeenCalled();
    });
  });

  // ── updateVote ──────────────────────────────────────────

  describe('updateVote', () => {
    it('should refresh the vote weight from the option', async () => {
      voteRepo.findOne.mockResolvedValue({
        userId: 'u1',
        optionId: 'o1',
        weight: 1,
        option: { pollId: 'p1', weight: 4 },
      });
      await service.updateVote('p1', 'u1', 'o1');
      expect(voteRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ weight: 4 }),
      );
    });

    it('should throw when no matching vote exists', async () => {
      voteRepo.findOne.mockResolvedValue(null);
      await expect(service.updateVote('p1', 'u1', 'o1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── deleteVote ──────────────────────────────────────────

  describe('deleteVote', () => {
    it('should remove vote', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      const r = await service.deleteVote('p1', 'u1');
      expect(r.deleted).toBe(true);
    });
  });

  // ── addOption ───────────────────────────────────────────

  describe('addOption', () => {
    it('should add an option with default weight 1 if creator and no votes', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      voteRepo.count.mockResolvedValue(0);
      await service.addOption('p1', 'u1', 'New option');
      expect(optionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ weight: 1 }),
      );
    });

    it('should add an option with a creator-assigned weight', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      voteRepo.count.mockResolvedValue(0);
      await service.addOption('p1', 'u1', 'New option', undefined, 1.5);
      expect(optionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ weight: 1.5 }),
      );
    });
  });
});
