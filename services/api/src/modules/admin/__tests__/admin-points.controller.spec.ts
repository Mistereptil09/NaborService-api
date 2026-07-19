import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminPointsController } from '../admin-points.controller';
import { PointsService } from '../../points/points.service';
import { PointsLedgerEntry } from '../../points/entities/points-ledger-entry.entity';
import { PointsLedgerEntryTypeEnum } from '../../../common/enums';

describe('AdminPointsController', () => {
  let controller: AdminPointsController;
  let mockLedgerRepo: any;
  let mockPointsService: any;

  beforeEach(async () => {
    mockLedgerRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };
    mockPointsService = {
      adminAdjust: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminPointsController],
      providers: [
        {
          provide: getRepositoryToken(PointsLedgerEntry),
          useValue: mockLedgerRepo,
        },
        {
          provide: PointsService,
          useValue: mockPointsService,
        },
      ],
    }).compile();

    controller = module.get<AdminPointsController>(AdminPointsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('adjustPoints', () => {
    it('should credit points and return success payload', async () => {
      const userId = 'user-1';
      mockPointsService.adminAdjust.mockResolvedValue({
        entry: { id: 'entry-1' } as PointsLedgerEntry,
        balanceAfterPoints: 1250,
      });

      const result = await controller.adjustPoints({
        userId,
        amountPoints: 250,
        description: 'Bonus admin',
      });

      expect(result).toEqual({
        success: true,
        userId,
        amountPoints: 250,
        balanceAfterPoints: 1250,
        entryId: 'entry-1',
      });
      expect(mockPointsService.adminAdjust).toHaveBeenCalledWith({
        userId,
        amountPoints: 250,
        type: PointsLedgerEntryTypeEnum.ADMIN_ADJUSTMENT,
        description: 'Bonus admin',
      });
    });

    it('should debit points and return success payload', async () => {
      const userId = 'user-1';
      mockPointsService.adminAdjust.mockResolvedValue({
        entry: { id: 'entry-2' } as PointsLedgerEntry,
        balanceAfterPoints: 750,
      });

      const result = await controller.adjustPoints({
        userId,
        amountPoints: -250,
        description: 'Pénalité admin',
      });

      expect(result.success).toBe(true);
      expect(result.amountPoints).toBe(-250);
      expect(result.balanceAfterPoints).toBe(750);
    });

    it('should reject zero amount', async () => {
      const result = await controller.adjustPoints({
        userId: 'user-1',
        amountPoints: 0,
      });

      expect(result.success).toBe(false);
      expect(mockPointsService.adminAdjust).not.toHaveBeenCalled();
    });

    it('should propagate service errors', async () => {
      mockPointsService.adminAdjust.mockRejectedValue(
        new ConflictException('negative balance'),
      );

      await expect(
        controller.adjustPoints({
          userId: 'user-1',
          amountPoints: -1000,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getLedger', () => {
    it('should return paginated ledger entries', async () => {
      const result = await controller.getLedger({
        offset: 0,
        limit: 20,
      });

      expect(result).toEqual({
        data: [],
        meta: { total: 0, offset: 0, limit: 20 },
      });
    });
  });
});
