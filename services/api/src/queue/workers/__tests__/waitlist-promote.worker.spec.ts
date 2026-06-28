import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { WaitlistPromoteWorker } from '../waitlist-promote.worker';
import { EventsGateway } from '../../../modules/events/events.gateway';
import { NotificationsService } from '../../../modules/messaging/notifications.service';
import { EventStatusEnum, ParticipantStatusEnum } from '../../../common/enums';

describe('WaitlistPromoteWorker', () => {
  let worker: WaitlistPromoteWorker;
  const mockManager = {
    findOne: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  const mockDataSource = {
    transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
  };
  const mockEventsGateway = {
    emitParticipantAdded: jest.fn(),
  };
  const mockNotificationsService = { create: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistPromoteWorker,
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventsGateway, useValue: mockEventsGateway },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    worker = module.get<WaitlistPromoteWorker>(WaitlistPromoteWorker);
    jest.clearAllMocks();
  });

  it('should do nothing if event is full', async () => {
    mockManager.findOne.mockResolvedValueOnce({
      id: 'evt-1',
      status: EventStatusEnum.OPEN,
      maxParticipants: 5,
    });
    mockManager.count.mockResolvedValue(5);

    await worker.process({ data: { eventId: 'evt-1' } } as any);

    expect(mockManager.find).not.toHaveBeenCalled();
  });

  it('should promote participants and create notifications', async () => {
    mockManager.findOne.mockResolvedValueOnce({
      id: 'evt-1',
      title: 'Test Event',
      status: EventStatusEnum.OPEN,
      maxParticipants: 5,
    });
    mockManager.count.mockResolvedValue(3); // 2 spots available
    mockManager.find.mockResolvedValueOnce([
      {
        userId: 'usr-1',
        eventId: 'evt-1',
        user: { email: 'usr1@example.com', firstName: 'John' },
      },
      {
        userId: 'usr-2',
        eventId: 'evt-1',
        user: { email: 'usr2@example.com', firstName: 'Jane' },
      },
    ]);

    await worker.process({ data: { eventId: 'evt-1' } } as any);

    expect(mockManager.save).toHaveBeenCalledTimes(2);
    expect(mockNotificationsService.create).toHaveBeenCalledTimes(2);
    expect(mockNotificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'waitlist_place' }),
    );
    expect(mockEventsGateway.emitParticipantAdded).toHaveBeenCalledTimes(2);
  });
});
