import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UnrecoverableError } from 'bullmq';
import { EventRegisterWorker } from '../event-register.worker';
import { EventsGateway } from '../../../modules/events/events.gateway';
import { EventStatusEnum, ParticipantStatusEnum } from '../../../common/enums';

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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventRegisterWorker,
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventsGateway, useValue: mockEventsGateway },
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
