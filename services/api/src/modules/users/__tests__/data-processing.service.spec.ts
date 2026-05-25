import { Repository, EntityManager } from 'typeorm';
import { DataProcessingService } from '../data-processing.service';
import { UserDataProcessing } from '../entities/user-data-processing.entity';

describe('DataProcessingService Unit Tests', () => {
  let mockRepo: jest.Mocked<Repository<UserDataProcessing>>;
  let service: DataProcessingService;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserDataProcessing>>;

    service = new DataProcessingService(mockRepo);
  });

  describe('isOptedOut missing row handling', () => {
    it('should return false when the user row is missing', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.isOptedOut('user-1', 'discovery');
      expect(result).toBe(false);
    });
  });

  describe('isOptedOut invalid type handling', () => {
    it('should return false when an invalid processing type is checked', async () => {
      const result = await service.isOptedOut('user-1', 'invalid-type');
      expect(result).toBe(false);
      expect(mockRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('getEffectiveOptOuts missing row handling', () => {
    it('should return an empty array when the user row is missing', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.getEffectiveOptOuts('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('setOptOuts and setRestricted updates', () => {
    it('should filter invalid types and update optOuts', async () => {
      await service.setOptOuts('user-1', ['discovery', 'invalid-type', 'notifications']);
      expect(mockRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1' },
        expect.objectContaining({
          optOuts: ['discovery', 'notifications'],
        }),
      );
    });

    it('should set restricted state to true', async () => {
      await service.setRestricted('user-1', true);
      expect(mockRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1' },
        expect.objectContaining({
          isRestricted: true,
          restrictedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('should reset restricted state to false', async () => {
      await service.setRestricted('user-1', false);
      expect(mockRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1' },
        expect.objectContaining({
          isRestricted: false,
          restrictedAt: null,
          updatedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('createDefault', () => {
    it('should create default entity and save it', async () => {
      const defaultEntity = { userId: 'user-1', optOuts: [], isRestricted: false } as UserDataProcessing;
      mockRepo.create.mockReturnValue(defaultEntity);
      mockRepo.save.mockResolvedValue(defaultEntity);

      const result = await service.createDefault('user-1');
      expect(mockRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        optOuts: [],
        isRestricted: false,
      });
      expect(mockRepo.save).toHaveBeenCalledWith(defaultEntity);
      expect(result).toBe(defaultEntity);
    });

    it('should use custom transaction manager when provided', async () => {
      const defaultEntity = { userId: 'user-1', optOuts: [], isRestricted: false } as UserDataProcessing;
      const mockManagerRepo = {
        create: jest.fn().mockReturnValue(defaultEntity),
        save: jest.fn().mockResolvedValue(defaultEntity),
      } as unknown as jest.Mocked<Repository<UserDataProcessing>>;

      const mockManager = {
        getRepository: jest.fn().mockReturnValue(mockManagerRepo),
      } as unknown as jest.Mocked<EntityManager>;

      const result = await service.createDefault('user-1', mockManager);
      expect(mockManager.getRepository).toHaveBeenCalledWith(UserDataProcessing);
      expect(mockManagerRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        optOuts: [],
        isRestricted: false,
      });
      expect(mockManagerRepo.save).toHaveBeenCalledWith(defaultEntity);
      expect(result).toBe(defaultEntity);
    });
  });
});
