import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PollsService } from '../polls.service';
import { Poll } from '../entities/poll.entity';
import { PollOption } from '../entities/poll-option.entity';
import { Vote } from '../entities/vote.entity';
import { PollTypeEnum } from '../../../common/enums';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PollsService', () => {
  let service: PollsService;
  let pollRepo: any;
  let optionRepo: any;
  let voteRepo: any;

  const makePoll = (overrides = {}) => ({
    id: 'p1', title: 'Test Poll', description: null, creatorId: 'u1',
    neighbourhoodId: 'nb1', pollType: PollTypeEnum.SINGLE,
    isAnonymous: false, startsAt: null, endsAt: null,
    closedAt: null, closedBy: null, createdAt: new Date(), updatedAt: null, deletedAt: null,
    options: [], ...overrides,
  });

  beforeEach(async () => {
    pollRepo = { create: jest.fn((d) => d), save: jest.fn((d) => Promise.resolve({ ...d, id: d.id ?? 'p1' })), findOne: jest.fn(), find: jest.fn(), count: jest.fn() };
    optionRepo = { create: jest.fn((d) => d), save: jest.fn((d) => Promise.resolve(d)), findOne: jest.fn(), remove: jest.fn() };
    voteRepo = { create: jest.fn((d) => d), save: jest.fn((d) => Promise.resolve(d)), findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), count: jest.fn(), delete: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PollsService,
        { provide: getRepositoryToken(Poll), useValue: pollRepo },
        { provide: getRepositoryToken(PollOption), useValue: optionRepo },
        { provide: getRepositoryToken(Vote), useValue: voteRepo },
      ],
    }).compile();

    service = module.get(PollsService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  // ── getActivePolls ──────────────────────────────────────

  describe('getActivePolls', () => {
    it('should return non-closed, non-deleted polls', async () => {
      pollRepo.find.mockResolvedValue([makePoll()]);
      const polls = await service.getActivePolls();
      expect(polls).toHaveLength(1);
    });

    it('should filter by neighbourhood', async () => {
      pollRepo.find.mockResolvedValue([]);
      await service.getActivePolls('nb1');
      expect(pollRepo.find).toHaveBeenCalled();
    });
  });

  // ── createPoll ──────────────────────────────────────────

  describe('createPoll', () => {
    it('should create a poll', async () => {
      const p = await service.createPoll('u1', { title: 'Q?' });
      expect(p.title).toBe('Q?');
      expect(p.creatorId).toBe('u1');
    });
  });

  // ── getPoll ─────────────────────────────────────────────

  describe('getPoll', () => {
    it('should return poll with results', async () => {
      pollRepo.findOne.mockResolvedValue({ ...makePoll(), options: [{ id: 'o1', label: 'Yes', pollId: 'p1' }] });
      voteRepo.find.mockResolvedValue([{ optionId: 'o1', weight: 2, option: { pollId: 'p1' } }]);
      const p = await service.getPoll('p1');
      expect(p.results).toBeDefined();
      expect(p.results[0].vote_count).toBe(2);
    });

    it('should throw on missing poll', async () => {
      pollRepo.findOne.mockResolvedValue(null);
      await expect(service.getPoll('p99')).rejects.toThrow(NotFoundException);
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
      await expect(service.updatePoll('p1', 'u1', { title: 'Nope' })).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-creator', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      await expect(service.updatePoll('p1', 'u2', { title: 'Nope' })).rejects.toThrow(ForbiddenException);
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
      await expect(service.closePoll('p1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── vote ────────────────────────────────────────────────

  describe('vote', () => {
    it('should cast a vote', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      optionRepo.findOne.mockResolvedValue({ id: 'o1', pollId: 'p1' });
      await service.vote('p1', 'u1', 'o1');
      expect(voteRepo.save).toHaveBeenCalled();
    });

    it('should reject on closed poll', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll({ closedAt: new Date() }));
      await expect(service.vote('p1', 'u1', 'o1')).rejects.toThrow(ForbiddenException);
    });

    it('should clear prior votes for SINGLE poll', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      optionRepo.findOne.mockResolvedValue({ id: 'o2', pollId: 'p1' });
      // Mock existing prior vote
      voteRepo.find.mockResolvedValue([{ userId: 'u1', optionId: 'o1', option: { pollId: 'p1' } }]);
      await service.vote('p1', 'u1', 'o2');
      expect(voteRepo.remove).toHaveBeenCalled();
      expect(voteRepo.save).toHaveBeenCalled(); // new vote saved
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
    it('should add an option if creator and no votes', async () => {
      pollRepo.findOne.mockResolvedValue(makePoll());
      voteRepo.count.mockResolvedValue(0);
      await service.addOption('p1', 'u1', 'New option');
      expect(optionRepo.save).toHaveBeenCalled();
    });
  });
});
