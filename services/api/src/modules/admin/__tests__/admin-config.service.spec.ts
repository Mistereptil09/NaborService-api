import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminConfigService } from '../admin-config.service';
import { PlatformConfig } from '../entities/platform-config.entity';

describe('AdminConfigService', () => {
  let service: AdminConfigService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminConfigService,
        {
          provide: getRepositoryToken(PlatformConfig),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AdminConfigService>(AdminConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return existing config if it exists', async () => {
    const mockConfig = { id: 1, commissionPercent: 10 } as PlatformConfig;
    mockRepository.findOne.mockResolvedValue(mockConfig);

    const result = await service.getConfig();
    expect(result).toEqual(mockConfig);
    expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('should seed default config if none exists', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    const result = await service.getConfig();
    expect(result.id).toBe(1);
    expect(result.commissionPercent).toBe(5);
    expect(mockRepository.create).toHaveBeenCalled();
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('should update config settings', async () => {
    const mockConfig = {
      id: 1,
      commissionPercent: 5,
      refundDeadlineHours: 48,
      contractExpirationHours: 24,
      waitlistConfirmHours: 24,
    } as PlatformConfig;
    mockRepository.findOne.mockResolvedValue(mockConfig);

    const result = await service.updateConfig({ commissionPercent: 8, contractExpirationHours: 12 });
    expect(result.commissionPercent).toBe(8);
    expect(result.contractExpirationHours).toBe(12);
    expect(result.refundDeadlineHours).toBe(48); // untouched
    expect(mockRepository.save).toHaveBeenCalledWith(mockConfig);
  });
});
