import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminStatsService } from '../admin-stats.service';
import { User } from '../../users/entities/user.entity';
import { Listing } from '../../listings/entities/listing.entity';
import { Evenement } from '../../events/entities/evenement.entity';
import { ListingTransaction } from '../../listings/entities/listing-transaction.entity';
import { Incident } from '../../incidents/entities/incident.entity';
import { EventParticipant } from '../../events/entities/event-participant.entity';

describe('AdminStatsService', () => {
  let service: AdminStatsService;
  let mockUserRepo: any;
  let mockListingRepo: any;
  let mockEventRepo: any;
  let mockTransactionRepo: any;
  let mockIncidentRepo: any;
  let mockParticipantRepo: any;

  beforeEach(async () => {
    mockUserRepo = { count: jest.fn().mockResolvedValue(10), createQueryBuilder: jest.fn() };
    mockListingRepo = { count: jest.fn().mockResolvedValue(5), createQueryBuilder: jest.fn() };
    mockEventRepo = { count: jest.fn().mockResolvedValue(3), createQueryBuilder: jest.fn() };
    mockTransactionRepo = { createQueryBuilder: jest.fn() };
    mockIncidentRepo = { count: jest.fn().mockResolvedValue(2), createQueryBuilder: jest.fn() };
    mockParticipantRepo = { createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminStatsService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Listing), useValue: mockListingRepo },
        { provide: getRepositoryToken(Evenement), useValue: mockEventRepo },
        { provide: getRepositoryToken(ListingTransaction), useValue: mockTransactionRepo },
        { provide: getRepositoryToken(Incident), useValue: mockIncidentRepo },
        { provide: getRepositoryToken(EventParticipant), useValue: mockParticipantRepo },
      ],
    }).compile();

    service = module.get<AdminStatsService>(AdminStatsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOverview', () => {
    it('should aggregate metrics from repositories', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '1500' }),
      };
      mockTransactionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const overview = await service.getOverview();
      expect(overview.totalUsers).toBe(10);
      expect(overview.totalListings).toBe(5);
      expect(overview.totalEvents).toBe(3);
      expect(overview.activeIncidents).toBe(2);
      expect(overview.totalPaymentsCents).toBe(1500);
    });
  });
});
