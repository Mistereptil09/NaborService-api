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
import { PointsService } from '../../points/points.service';
import { AdminConfigService } from '../../admin/admin-config.service';
import { EventMediaService } from '../event-media.service';
import { EventStatusEnum } from '../../../common/enums';

describe('EventsService', () => {
  let service: EventsService;
  let mockEventRepo: any;
  let mockParticipantRepo: any;
  let mockBlockRepo: any;
  let mockRegisterQueue: any;
  let mockPointsService: any;
  let mockEventMediaService: any;
  let queryBuilder: any;

  beforeEach(async () => {
    queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
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
    mockParticipantRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(0),
      manager: {
        transaction: jest.fn((cb: (m: unknown) => unknown) =>
          cb({ save: jest.fn((e: unknown) => Promise.resolve(e)) }),
        ),
      },
    };
    mockBlockRepo = { find: jest.fn().mockResolvedValue([]) };
    mockRegisterQueue = { add: jest.fn().mockResolvedValue({}) };
    mockPointsService = {
      getBalance: jest.fn().mockResolvedValue(1000),
      credit: jest.fn().mockResolvedValue({}),
    };
    mockEventMediaService = {
      findCoverMediaIds: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Evenement), useValue: mockEventRepo },
        {
          provide: getRepositoryToken(EventParticipant),
          useValue: mockParticipantRepo,
        },
        {
          provide: getRepositoryToken(EventSwipe),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        { provide: getRepositoryToken(ChatGroup), useValue: {} },
        { provide: getRepositoryToken(UserBlock), useValue: mockBlockRepo },
        { provide: EventMediaService, useValue: mockEventMediaService },
        {
          provide: getQueueToken('event-register'),
          useValue: mockRegisterQueue,
        },
        {
          provide: getQueueToken('waitlist-promote'),
          useValue: { add: jest.fn() },
        },
        {
          provide: PointsService,
          useValue: mockPointsService,
        },
        {
          provide: AdminConfigService,
          useValue: { getConfig: jest.fn().mockResolvedValue({ centsPerPoint: 1 }) },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
    mockBlockRepo.find.mockResolvedValue([]);
    mockEventMediaService.findCoverMediaIds.mockResolvedValue(new Map());
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

    it('should reject registration when user has insufficient points', async () => {
      mockEventRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        status: EventStatusEnum.OPEN,
        startsAt: null,
        costCents: 500,
      });
      mockPointsService.getBalance.mockResolvedValueOnce(0);

      await expect(service.register('evt-1', 'usr-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRegisterQueue.add).not.toHaveBeenCalled();
    });

    it('should reject registration when event is full', async () => {
      mockEventRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        status: EventStatusEnum.OPEN,
        startsAt: null,
        maxParticipants: 1,
      });
      mockParticipantRepo.count.mockResolvedValueOnce(1);

      await expect(service.register('evt-1', 'usr-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRegisterQueue.add).not.toHaveBeenCalled();
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

    it('should enrich each event with its coverMediaId (present or null)', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([
        [
          { id: 'evt-with-cover', title: 'A' },
          { id: 'evt-no-cover', title: 'B' },
        ],
        2,
      ]);
      mockEventMediaService.findCoverMediaIds.mockResolvedValue(
        new Map([['evt-with-cover', '6a5d254b65960338addcfe74']]),
      );

      const result = await service.findAll('usr-1', { offset: 0, limit: 20 });

      expect(mockEventMediaService.findCoverMediaIds).toHaveBeenCalledWith([
        'evt-with-cover',
        'evt-no-cover',
      ]);
      expect(result.data[0].coverMediaId).toBe('6a5d254b65960338addcfe74');
      expect(result.data[1].coverMediaId).toBeNull();
    });
  });

  describe('findOneWithCover', () => {
    it('should return the event enriched with its coverMediaId', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1', title: 'A' });
      mockEventMediaService.findCoverMediaIds.mockResolvedValue(
        new Map([['evt-1', '6a5d254b65960338addcfe74']]),
      );

      const result = await service.findOneWithCover('evt-1');

      expect(result.coverMediaId).toBe('6a5d254b65960338addcfe74');
      expect(result.id).toBe('evt-1');
    });

    it('should return coverMediaId null when the event has no media', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1', title: 'A' });
      mockEventMediaService.findCoverMediaIds.mockResolvedValue(new Map());

      const result = await service.findOneWithCover('evt-1');

      expect(result.coverMediaId).toBeNull();
    });

    it('should expose the caller participation status when userId is given', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1', title: 'A' });
      mockParticipantRepo.findOne.mockResolvedValue({ status: 'registered' });

      const result = await service.findOneWithCover('evt-1', 'usr-1');

      expect(result.participationStatus).toBe('registered');
    });

    it('should return participationStatus null when the caller has no active participation', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1', title: 'A' });
      mockParticipantRepo.findOne.mockResolvedValue(null);

      const result = await service.findOneWithCover('evt-1', 'usr-1');

      expect(result.participationStatus).toBeNull();
    });
  });

  describe('findUserOperations', () => {
    it('should filter on creator or active participant and enrich the results', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([
        [
          { id: 'evt-1', title: 'A', costCents: 200 },
          { id: 'evt-2', title: 'B', costCents: 0 },
        ],
        2,
      ]);
      mockEventMediaService.findCoverMediaIds.mockResolvedValue(
        new Map([['evt-1', '6a5d254b65960338addcfe74']]),
      );

      const result = await service.findUserOperations('usr-1', {
        offset: 0,
        limit: 20,
      });

      expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
        EventParticipant,
        'participant',
        expect.stringContaining('participant.user_id = :userId'),
        expect.objectContaining({ userId: 'usr-1' }),
      );
      expect(queryBuilder.where).toHaveBeenCalledWith(
        '(event.creatorId = :userId OR participant.user_id IS NOT NULL)',
        { userId: 'usr-1' },
      );
      expect(result.meta.total).toBe(2);
      expect(result.data[0].costPoints).toBe(200);
      expect(result.data[0].coverMediaId).toBe('6a5d254b65960338addcfe74');
      expect(result.data[1].coverMediaId).toBeNull();
    });
  });

  describe('findUserRegistrations', () => {
    it('should return participations enriched with event, cover and status', async () => {
      mockParticipantRepo.findAndCount.mockResolvedValue([
        [
          {
            eventId: 'evt-1',
            userId: 'usr-1',
            status: 'waitlisted',
            registeredAt: new Date('2026-07-01T00:00:00Z'),
            event: { id: 'evt-1', title: 'A', costCents: 300 },
          },
        ],
        1,
      ]);
      mockEventMediaService.findCoverMediaIds.mockResolvedValue(
        new Map([['evt-1', '6a5d254b65960338addcfe74']]),
      );

      const result = await service.findUserRegistrations('usr-1', {
        offset: 0,
        limit: 20,
      });

      expect(mockParticipantRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['event'],
          skip: 0,
          take: 20,
        }),
      );
      expect(result.meta.total).toBe(1);
      expect(result.data[0].participationStatus).toBe('waitlisted');
      expect(result.data[0].costPoints).toBe(300);
      expect(result.data[0].coverMediaId).toBe('6a5d254b65960338addcfe74');
    });
  });

  describe('cancelRegistration', () => {
    it('should refund paid points within the refund deadline', async () => {
      mockParticipantRepo.findOne.mockResolvedValue({
        eventId: 'evt-1',
        userId: 'usr-1',
        status: 'registered',
        paymentStatus: 'completed',
        amountPoints: 50,
        registeredAt: new Date(Date.now() - 60_000),
      });
      mockEventRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        refundDeadlineHours: 48,
      });

      await service.cancelRegistration('evt-1', 'usr-1');

      expect(mockPointsService.credit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-1',
          amountPoints: 50,
          type: 'event_refund',
          referenceId: 'evt-1',
        }),
        expect.anything(),
      );
    });

    it('should not refund after the refund deadline', async () => {
      mockParticipantRepo.findOne.mockResolvedValue({
        eventId: 'evt-1',
        userId: 'usr-1',
        status: 'registered',
        paymentStatus: 'completed',
        amountPoints: 50,
        registeredAt: new Date(Date.now() - 72 * 3_600_000),
      });
      mockEventRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        refundDeadlineHours: 48,
      });

      await service.cancelRegistration('evt-1', 'usr-1');

      expect(mockPointsService.credit).not.toHaveBeenCalled();
    });

    it('should not refund a free registration', async () => {
      mockParticipantRepo.findOne.mockResolvedValue({
        eventId: 'evt-1',
        userId: 'usr-1',
        status: 'registered',
        paymentStatus: 'free',
        amountPoints: 0,
        registeredAt: new Date(),
      });
      mockEventRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        refundDeadlineHours: 48,
      });

      await service.cancelRegistration('evt-1', 'usr-1');

      expect(mockPointsService.credit).not.toHaveBeenCalled();
    });
  });
});
