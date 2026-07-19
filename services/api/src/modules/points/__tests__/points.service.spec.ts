import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PointsService } from '../points.service';
import { PointsLedgerEntry } from '../entities/points-ledger-entry.entity';
import { PointsLedgerEntryTypeEnum } from '../../../common/enums';

describe('PointsService', () => {
  let service: PointsService;
  let mockDataSource: any;
  let mockLedgerRepo: any;

  beforeEach(async () => {
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      }),
      create: jest.fn().mockImplementation((_, dto) => dto),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn(),
      }),
    };

    mockLedgerRepo = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointsService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(PointsLedgerEntry),
          useValue: mockLedgerRepo,
        },
      ],
    }).compile();

    service = module.get<PointsService>(PointsService);
    (service as any).dataSource = mockDataSource;
  });

  describe('adminAdjust', () => {
    it('should credit points with a positive amount', async () => {
      const manager = mockDataSource.transaction.mock.calls[0]?.[0] as any;
      const user = { id: 'user-1', pointsBalance: 100 };
      mockDataSource.transaction.mockImplementationOnce((cb: any) =>
        cb({
          createQueryBuilder: jest.fn().mockReturnValue({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(user),
          }),
          create: jest.fn().mockImplementation((_, dto) => dto),
          save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
        }),
      );

      const result = await service.adminAdjust({
        userId: 'user-1',
        amountPoints: 150,
        type: PointsLedgerEntryTypeEnum.ADMIN_ADJUSTMENT,
        description: 'Admin correction',
      });

      expect(result.balanceAfterPoints).toBe(250);
      expect(result.entry.amountPoints).toBe(150);
      expect(result.entry.type).toBe(PointsLedgerEntryTypeEnum.ADMIN_ADJUSTMENT);
    });

    it('should debit points with a negative amount', async () => {
      const user = { id: 'user-1', pointsBalance: 500 };
      mockDataSource.transaction.mockImplementationOnce((cb: any) =>
        cb({
          createQueryBuilder: jest.fn().mockReturnValue({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(user),
          }),
          create: jest.fn().mockImplementation((_, dto) => dto),
          save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
        }),
      );

      const result = await service.adminAdjust({
        userId: 'user-1',
        amountPoints: -200,
        type: PointsLedgerEntryTypeEnum.ADMIN_ADJUSTMENT,
      });

      expect(result.balanceAfterPoints).toBe(300);
      expect(result.entry.amountPoints).toBe(-200);
    });

    it('should reject adjustment that would make balance negative', async () => {
      const user = { id: 'user-1', pointsBalance: 100 };
      mockDataSource.transaction.mockImplementationOnce((cb: any) =>
        cb({
          createQueryBuilder: jest.fn().mockReturnValue({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(user),
          }),
          create: jest.fn(),
          save: jest.fn(),
        }),
      );

      await expect(
        service.adminAdjust({
          userId: 'user-1',
          amountPoints: -200,
          type: PointsLedgerEntryTypeEnum.ADMIN_ADJUSTMENT,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockDataSource.transaction.mockImplementationOnce((cb: any) =>
        cb({
          createQueryBuilder: jest.fn().mockReturnValue({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null),
          }),
          create: jest.fn(),
          save: jest.fn(),
        }),
      );

      await expect(
        service.adminAdjust({
          userId: 'missing-user',
          amountPoints: 100,
          type: PointsLedgerEntryTypeEnum.ADMIN_ADJUSTMENT,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
