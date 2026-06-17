import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GeoReconciliationService } from '../geo-reconciliation.service';
import { Neo4jService } from '../../../database/neo4j/neo4j.service';
import { User } from '../../users/entities/user.entity';
import { Listing } from '../../listings/entities/listing.entity';
import { Evenement } from '../../events/entities/evenement.entity';
import { Follow } from '../../social/entities/follow.entity';
import { Friendship } from '../../social/entities/friendship.entity';
import { UserBlock } from '../../social/entities/user-block.entity';

describe('GeoReconciliationService', () => {
  let service: GeoReconciliationService;
  let neo4jService: Neo4jService;
  let userRepository: any;

  beforeEach(async () => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const mockRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeoReconciliationService,
        {
          provide: getRepositoryToken(User),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(Listing),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(Evenement),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(Follow),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(Friendship),
          useValue: { ...mockRepo },
        },
        {
          provide: getRepositoryToken(UserBlock),
          useValue: { ...mockRepo },
        },
        {
          provide: Neo4jService,
          useValue: {
            run: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GeoReconciliationService>(GeoReconciliationService);
    neo4jService = module.get<Neo4jService>(Neo4jService);
    userRepository = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reconcileRecentEntities', () => {
    it('should do nothing if PostgreSQL and Neo4j match', async () => {
      userRepository
        .createQueryBuilder()
        .getMany.mockResolvedValueOnce([
          { id: 'user-1', neighbourhoodId: 'nb-1' },
        ]);

      (neo4jService.run as jest.Mock).mockResolvedValueOnce({
        records: [{ get: () => 'nb-1' }], // Match
      });

      await service.reconcileRecentEntities(24);

      expect(neo4jService.run).toHaveBeenCalledTimes(1); // Only the check query
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('should update Neo4j if Postgres has a neighbourhood but Neo4j lacks it', async () => {
      userRepository
        .createQueryBuilder()
        .getMany.mockResolvedValueOnce([
          { id: 'user-1', neighbourhoodId: 'nb-1' },
        ]);

      // 1. Neo4j current state: lacks relationship
      (neo4jService.run as jest.Mock).mockResolvedValueOnce({
        records: [{ get: () => null }],
      });
      // 2. Check if neighbourhood exists in Neo4j
      (neo4jService.run as jest.Mock).mockResolvedValueOnce({
        records: [{ get: () => ({}) }], // exists
      });

      await service.reconcileRecentEntities(24);

      expect(neo4jService.run).toHaveBeenCalledTimes(3);
      // 3rd call is the fix query
      expect(neo4jService.run).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('MERGE'),
        expect.any(Object),
      );
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('should nullify Postgres if Postgres has a neighbourhood that does not exist in Neo4j', async () => {
      userRepository
        .createQueryBuilder()
        .getMany.mockResolvedValueOnce([
          { id: 'user-1', neighbourhoodId: 'nb-1' },
        ]);

      // 1. Neo4j current state: lacks relationship
      (neo4jService.run as jest.Mock).mockResolvedValueOnce({
        records: [{ get: () => null }],
      });
      // 2. Check if neighbourhood exists in Neo4j
      (neo4jService.run as jest.Mock).mockResolvedValueOnce({
        records: [], // does NOT exist
      });

      await service.reconcileRecentEntities(24);

      expect(neo4jService.run).toHaveBeenCalledTimes(2);
      expect(userRepository.update).toHaveBeenCalledWith('user-1', {
        neighbourhoodId: null,
      });
    });

    it('should delete Neo4j relationship if Postgres has null but Neo4j has a neighbourhood', async () => {
      userRepository
        .createQueryBuilder()
        .getMany.mockResolvedValueOnce([
          { id: 'user-1', neighbourhoodId: null },
        ]);

      // 1. Neo4j current state: has relationship
      (neo4jService.run as jest.Mock).mockResolvedValueOnce({
        records: [{ get: () => 'nb-old' }],
      });

      await service.reconcileRecentEntities(24);

      expect(neo4jService.run).toHaveBeenCalledTimes(2);
      // 2nd call is the fix query
      expect(neo4jService.run).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('DELETE'),
        expect.any(Object),
      );
      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });
});
