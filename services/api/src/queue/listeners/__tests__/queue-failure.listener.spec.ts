import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QueueFailureListener } from '../queue-failure.listener';
import { QueueEvents } from 'bullmq';

jest.mock('bullmq', () => {
  return {
    QueueEvents: jest.fn().mockImplementation(() => {
      return {
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe('QueueFailureListener', () => {
  let listener: QueueFailureListener;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueFailureListener,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('localhost'),
          },
        },
      ],
    }).compile();

    listener = module.get<QueueFailureListener>(QueueFailureListener);
  });

  it('should initialize QueueEvents for all queues', () => {
    listener.onModuleInit();
    expect(QueueEvents).toHaveBeenCalledTimes(9);
  });

  it('should close all QueueEvents on destroy', async () => {
    listener.onModuleInit();
    await listener.onModuleDestroy();
    // Verify close was called on the mocked instances (implicit in array size 9)
    const instances = (listener as any).queueEventsList;
    expect(instances.length).toBe(9);
    instances.forEach((inst: any) => {
      expect(inst.close).toHaveBeenCalled();
    });
  });
});
