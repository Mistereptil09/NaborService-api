import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventAutoCompleteService } from '../event-auto-complete.service';
import { Evenement } from '../entities/evenement.entity';
import { EventStatusEnum } from '../../../common/enums';

describe('EventAutoCompleteService', () => {
  let service: EventAutoCompleteService;
  let updateBuilder: any;
  let mockEventRepo: any;

  beforeEach(async () => {
    updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    mockEventRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventAutoCompleteService,
        { provide: getRepositoryToken(Evenement), useValue: mockEventRepo },
      ],
    }).compile();

    service = module.get<EventAutoCompleteService>(EventAutoCompleteService);
    jest.clearAllMocks();
  });

  it('should transition elapsed open events to completed with completedAt', async () => {
    updateBuilder.execute.mockResolvedValue({ affected: 2 });

    await service.completeElapsedEvents();

    // Only open events are targeted.
    expect(updateBuilder.where).toHaveBeenCalledWith('status = :status', {
      status: EventStatusEnum.OPEN,
    });
    // Set to completed with a completedAt timestamp.
    const setArg = updateBuilder.set.mock.calls[0][0];
    expect(setArg.status).toBe(EventStatusEnum.COMPLETED);
    expect(setArg.completedAt).toBeInstanceOf(Date);
    // Only past events (COALESCE(ends_at, starts_at) < now).
    expect(updateBuilder.andWhere).toHaveBeenCalledWith(
      'COALESCE(ends_at, starts_at) < :now',
      expect.objectContaining({ now: expect.any(Date) }),
    );
  });

  it('should not throw and issue no side effects when no event is elapsed', async () => {
    updateBuilder.execute.mockResolvedValue({ affected: 0 });

    await expect(service.completeElapsedEvents()).resolves.toBeUndefined();
    expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it('should swallow errors so the cron keeps running', async () => {
    updateBuilder.execute.mockRejectedValue(new Error('db down'));

    await expect(service.completeElapsedEvents()).resolves.toBeUndefined();
  });
});
