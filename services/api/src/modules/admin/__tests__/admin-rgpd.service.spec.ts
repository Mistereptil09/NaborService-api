import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { AdminRgpdService } from '../admin-rgpd.service';
import { User } from '../../users/entities/user.entity';

describe('AdminRgpdService', () => {
  let service: AdminRgpdService;
  let mockRepository: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    mockQueue = {
      add: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRgpdService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
        {
          provide: 'BullQueue_rgpd-anonymise',
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<AdminRgpdService>(AdminRgpdService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRgpdRequests', () => {
    it('should map soft-deleted users and set their status based on name prefix', async () => {
      const mockUsers = [
        { id: '1', firstName: 'Alice', lastName: 'Dupont', email: 'a@a.com', deletedAt: new Date() },
        { id: '2', firstName: 'Anonymized-123456', lastName: 'Anonymized-123456', email: 'anonymized-123@deleted.user', deletedAt: new Date() },
      ];
      mockRepository.find.mockResolvedValue(mockUsers);

      const result = await service.getRgpdRequests();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        userId: '1',
        email: 'a@a.com',
        firstName: 'Alice',
        lastName: 'Dupont',
        deletedAt: mockUsers[0].deletedAt,
        status: 'pending',
      });
      expect(result[1]).toEqual({
        userId: '2',
        email: 'anonymized-123@deleted.user',
        firstName: 'Anonymized-123456',
        lastName: 'Anonymized-123456',
        deletedAt: mockUsers[1].deletedAt,
        status: 'completed',
      });
    });
  });

  describe('getRgpdRequestStatus', () => {
    it('should throw NotFoundException if user does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.getRgpdRequestStatus('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should return none status if user is not deleted', async () => {
      const user = { id: '1', deletedAt: null } as User;
      mockRepository.findOne.mockResolvedValue(user);
      const result = await service.getRgpdRequestStatus('1');
      expect(result).toEqual({ status: 'none' });
    });

    it('should return pending if deleted but not anonymized', async () => {
      const user = { id: '1', firstName: 'Bob', deletedAt: new Date() } as User;
      mockRepository.findOne.mockResolvedValue(user);
      const result = await service.getRgpdRequestStatus('1');
      expect(result).toEqual({ status: 'pending' });
    });

    it('should return completed if deleted and anonymized', async () => {
      const user = { id: '1', firstName: 'Anonymized-123', deletedAt: new Date() } as User;
      mockRepository.findOne.mockResolvedValue(user);
      const result = await service.getRgpdRequestStatus('1');
      expect(result).toEqual({ status: 'completed' });
    });
  });

  describe('anonymizeUserManually', () => {
    it('should throw BadRequestException if user is not soft deleted', async () => {
      const user = { id: '1', deletedAt: null } as User;
      mockRepository.findOne.mockResolvedValue(user);
      await expect(service.anonymizeUserManually('1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if user is already anonymized', async () => {
      const user = { id: '1', firstName: 'Anonymized-123', deletedAt: new Date() } as User;
      mockRepository.findOne.mockResolvedValue(user);
      await expect(service.anonymizeUserManually('1')).rejects.toThrow(ConflictException);
    });

    it('should enqueue job if user is deleted but not anonymized', async () => {
      const user = { id: '1', firstName: 'Bob', deletedAt: new Date() } as User;
      mockRepository.findOne.mockResolvedValue(user);

      const result = await service.anonymizeUserManually('1');
      expect(result).toEqual({ success: true });
      expect(mockQueue.add).toHaveBeenCalledWith('user.anonymise', { userId: '1' });
    });
  });
});
