import { Test, TestingModule } from '@nestjs/testing';
import { GeoPipelineProcessor } from '../geo-pipeline.processor';
import { BanService } from '../ban.service';
import { Neo4jGeoService } from '../neo4j-geo.service';
import { Neo4jService } from '../../../database/neo4j/neo4j.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { Listing } from '../../listings/entities/listing.entity';
import { Evenement } from '../../events/entities/evenement.entity';

describe('GeoPipelineProcessor', () => {
  let processor: GeoPipelineProcessor;
  let banService: BanService;
  let neo4jGeoService: Neo4jGeoService;
  let neo4jService: Neo4jService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeoPipelineProcessor,
        {
          provide: BanService,
          useValue: {
            geocode: jest.fn(),
          },
        },
        {
          provide: Neo4jGeoService,
          useValue: {
            assignNeighbourhood: jest.fn(),
          },
        },
        {
          provide: Neo4jService,
          useValue: {
            run: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Listing),
          useValue: {
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Evenement),
          useValue: {
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<GeoPipelineProcessor>(GeoPipelineProcessor);
    banService = module.get<BanService>(BanService);
    neo4jGeoService = module.get<Neo4jGeoService>(Neo4jGeoService);
    neo4jService = module.get<Neo4jService>(Neo4jService);
  });

  it('should orchestrate user geocoding correctly', async () => {
    (banService.geocode as jest.Mock).mockResolvedValue({
      latitude: 48,
      longitude: 2,
      confidence: 0.9,
    });
    (neo4jGeoService.assignNeighbourhood as jest.Mock).mockResolvedValue({
      neighbourhoodId: 'nb-1',
      method: 'polygon',
    });

    await processor.processUserGeocode('user-1', 'Paris');

    expect(banService.geocode).toHaveBeenCalledWith('Paris');
    expect(neo4jGeoService.assignNeighbourhood).toHaveBeenCalledWith(48, 2);
    expect(neo4jService.run).toHaveBeenCalledWith(
      expect.stringContaining('MERGE (e)-[newR:LIVES_IN]->(n)'),
      {
        entityPgId: 'user-1',
        neighbourhoodId: 'nb-1',
      },
    );
  });

  it('should remove relationships if no neighbourhood is found', async () => {
    (banService.geocode as jest.Mock).mockResolvedValue({
      latitude: 48,
      longitude: 2,
      confidence: 0.9,
    });
    (neo4jGeoService.assignNeighbourhood as jest.Mock).mockResolvedValue(null);

    await processor.processUserGeocode('user-1', 'Paris');

    expect(neo4jService.run).toHaveBeenCalledWith(
      expect.stringContaining('DELETE r'),
      {
        entityPgId: 'user-1',
      },
    );
  });
});
