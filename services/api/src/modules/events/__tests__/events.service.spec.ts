import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException } from '@nestjs/common';
import { EventsService } from '../events.service';
import { Evenement } from '../entities/evenement.entity';
import { EventParticipant } from '../entities/event-participant.entity';
import { EventSwipe } from '../entities/event-swipe.entity';
import { ChatGroup } from '../../messaging/entities/chat-group.entity';
import { UserBlock } from '../../social/entities/user-block.entity';
import { EventStatusEnum } from '../../../common/enums';

describe('EventsService', () => {
  let service: EventsService;
  let mockEventRepo: any;
  let mockParticipantRepo: any;
  let mockBlockRepo: any;
  let mockRegisterQueue: any;
  let queryBuilder: any;

  beforeEach(async () => {
    queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    mockEventRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    mockParticipantRepo = { findOne: jest.fn(), find: jest.fn() };
    mockBlockRepo = { find: jest.fn().mockResolvedValue([]) };
    mockRegisterQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Evenement), useValue: mockEventRepo },
        {
          provide: getRepositoryToken(EventParticipant),
          useValue: mockParticipantRepo,
        },
        { provide: getRepositoryToken(EventSwipe), useValue: {} },
        { provide: getRepositoryToken(ChatGroup), useValue: {} },
        { provide: getRepositoryToken(UserBlock), useValue: mockBlockRepo },
        {
          provide: getQueueToken('event-register'),
          useValue: mockRegisterQueue,
        },
        {
          provide: getQueueToken('waitlist-promote'),
          useValue: { add: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
    mockBlockRepo.find.mockResolvedValue([]);
  });

  describe('register', () => {
    it('should reject registration on an event that has already started', async () => {
      mockEventRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        status: EventStatusEnum.OPEN,
        startsAt: new Date(Date.now() - 60_000),
      });

      await expect(service.register('evt-1', 'usr-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRegisterQueue.add).not.toHaveBeenCalled();
    });

    it('should accept registration on a future event', async () => {
      mockEventRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        status: EventStatusEnum.OPEN,
        startsAt: new Date(Date.now() + 3_600_000),
      });

      await expect(service.register('evt-1', 'usr-1')).resolves.toEqual({
        success: true,
      });
      expect(mockRegisterQueue.add).toHaveBeenCalled();
    });

    it('should accept registration when startsAt is null', async () => {
      mockEventRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        status: EventStatusEnum.OPEN,
        startsAt: null,
      });

      await expect(service.register('evt-1', 'usr-1')).resolves.toEqual({
        success: true,
      });
      expect(mockRegisterQueue.add).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should filter and order by starts_at ASC when upcoming=true', async () => {
      await service.findAll('usr-1', {
        offset: 0,
        limit: 20,
        upcoming: true,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(event.startsAt IS NULL OR event.startsAt >= :now)',
        expect.objectContaining({ now: expect.any(Date) }),
      );
      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'event.startsAt',
        'ASC',
      );
    });

    it('should order by createdAt DESC by default (no upcoming filter)', async () => {
      await service.findAll('usr-1', { offset: 0, limit: 20 });

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'event.createdAt',
        'DESC',
      );
      expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
        '(event.startsAt IS NULL OR event.startsAt >= :now)',
        expect.anything(),
      );
    });
  });
});
