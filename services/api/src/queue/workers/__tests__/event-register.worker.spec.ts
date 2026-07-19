import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UnrecoverableError } from 'bullmq';
import { EventRegisterWorker } from '../event-register.worker';
import { EventsGateway } from '../../../modules/events/events.gateway';
import { EventStatusEnum, ParticipantStatusEnum } from '../../../common/enums';
import { PointsService } from '../../../modules/points/points.service';
import { AdminConfigService } from '../../../modules/admin/admin-config.service';

describe('EventRegisterWorker', () => {
  let worker: EventRegisterWorker;
  const mockManager = {
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockDataSource = {
    transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
  };
  const mockEventsGateway = {
    emitParticipantAdded: jest.fn(),
    emitRegistrationFailed: jest.fn(),
    emitRegistrationResult: jest.fn(),
  };
  const mockPointsService = {
    debit: jest.fn().mockResolvedValue({}),
  };
  const mockAdminConfigService = {
    getConfig: jest.fn().mockResolvedValue({ centsPerPoint: 1 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventRegisterWorker,
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventsGateway, useValue: mockEventsGateway },
        { provide: PointsService, useValue: mockPointsService },
        { provide: AdminConfigService, useValue: mockAdminConfigService },
      ],
    }).compile();

    worker = module.get<EventRegisterWorker>(EventRegisterWorker);
    jest.clearAllMocks();
  });

  it('should successfully register participant and emit event', async () => {
    mockManager.findOne
      .mockResolvedValueOnce({
        id: 'evt-1',
        status: EventStatusEnum.OPEN,
        maxParticipants: 10,
      })
      .mockResolvedValueOnce(null);
    mockManager.count.mockResolvedValue(5);
    mockManager.create.mockReturnValue({ eventId: 'evt-1', userId: 'usr-1' });

    await worker.process({
      data: { eventId: 'evt-1', userId: 'usr-1' },
    } as any);

    expect(mockManager.save).toHaveBeenCalled();
    expect(mockEventsGateway.emitParticipantAdded).toHaveBeenCalledWith(
      'evt-1',
      'usr-1',
    );
    expect(mockEventsGateway.emitRegistrationResult).toHaveBeenCalledWith(
      'usr-1',
      'evt-1',
      'registered',
    );
  });

  it('should throw UnrecoverableError if event is full', async () => {
    mockManager.findOne.mockResolvedValueOnce({
      id: 'evt-1',
      status: EventStatusEnum.OPEN,
      maxParticipants: 5,
    });
    mockManager.count.mockResolvedValue(5);

    await expect(
      worker.process({ data: { eventId: 'evt-1', userId: 'usr-2' } } as any),
    ).rejects.toThrow(UnrecoverableError);

    expect(mockEventsGateway.emitRegistrationFailed).toHaveBeenCalledWith(
      'evt-1',
      'usr-2',
      'EVENT_FULL',
    );
  });

  it('should throw UnrecoverableError if the event has already started', async () => {
    mockManager.findOne.mockResolvedValueOnce({
      id: 'evt-1',
      status: EventStatusEnum.OPEN,
      maxParticipants: 10,
      startsAt: new Date(Date.now() - 60_000),
    });

    await expect(
      worker.process({ data: { eventId: 'evt-1', userId: 'usr-1' } } as any),
    ).rejects.toThrow(UnrecoverableError);

    expect(mockManager.save).not.toHaveBeenCalled();
  });

  it('should throw UnrecoverableError if already registered', async () => {
    mockManager.findOne
      .mockResolvedValueOnce({
        id: 'evt-1',
        status: EventStatusEnum.OPEN,
        maxParticipants: 10,
      })
      .mockResolvedValueOnce({
        eventId: 'evt-1',
        userId: 'usr-1',
        status: ParticipantStatusEnum.REGISTERED,
      });
    mockManager.count.mockResolvedValue(5);

    await expect(
      worker.process({ data: { eventId: 'evt-1', userId: 'usr-1' } } as any),
    ).rejects.toThrow(UnrecoverableError);
  });
});
