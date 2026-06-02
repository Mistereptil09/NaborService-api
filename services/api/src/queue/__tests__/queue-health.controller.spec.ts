import { Test, TestingModule } from '@nestjs/testing';
import { QueueHealthController } from '../queue-health.controller';
import { QueueHealthService } from '../queue-health.service';
import { HttpStatus, HttpException } from '@nestjs/common';

describe('QueueHealthController', () => {
  let controller: QueueHealthController;
  let service: QueueHealthService;

  const mockResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueHealthController],
      providers: [
        {
          provide: QueueHealthService,
          useValue: {
            getMetrics: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<QueueHealthController>(QueueHealthController);
    service = module.get<QueueHealthService>(QueueHealthService);
  });

  it('should return metrics when available', async () => {
    const metrics = { status: 'ok', timestamp: '2023-01-01', queues: {} };
    jest.spyOn(service, 'getMetrics').mockResolvedValue(metrics as any);

    const result = await controller.checkHealth();
    expect(result).toBe(metrics);
  });

  it('should throw HttpException when Redis is unreachable', async () => {
    const metrics = {
      status: 'error',
      timestamp: '2023-01-01',
      message: 'Metrics temporarily unavailable',
    };
    jest.spyOn(service, 'getMetrics').mockResolvedValue(metrics as any);

    try {
      await controller.checkHealth();
      fail('Should have thrown HttpException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(e.getResponse()).toBe(metrics);
    }
  });
});
