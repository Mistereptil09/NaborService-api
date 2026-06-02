import { Test, TestingModule } from '@nestjs/testing';
import { NeighbourhoodAdminController } from '../neighbourhood-admin.controller';
import { Neo4jGeoService } from '../neo4j-geo.service';
import { GeoReconciliationService } from '../geo-reconciliation.service';
import { BadRequestException } from '@nestjs/common';

describe('NeighbourhoodAdminController', () => {
  let controller: NeighbourhoodAdminController;
  let neo4jGeoService: Neo4jGeoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NeighbourhoodAdminController],
      providers: [
        {
          provide: Neo4jGeoService,
          useValue: {
            createNeighbourhood: jest.fn(),
            updateNeighbourhoodPolygon: jest.fn(),
          },
        },
        {
          provide: GeoReconciliationService,
          useValue: {
            reconcileRecentEntities: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NeighbourhoodAdminController>(
      NeighbourhoodAdminController,
    );
    neo4jGeoService = module.get<Neo4jGeoService>(Neo4jGeoService);
  });

  it('should call createNeighbourhood', async () => {
    const polygon = { type: 'Polygon', coordinates: [] } as any;
    const metadata = {
      pg_id: 'nb1',
      name: 'Test',
      city: 'Paris',
      zip_code: '75001',
      country: 'FR',
    };

    (neo4jGeoService.createNeighbourhood as jest.Mock).mockResolvedValue({
      id: 'nb1',
    });

    const result = await controller.createNeighbourhood({ polygon, metadata });
    expect(result).toEqual({ id: 'nb1' });
    expect(neo4jGeoService.createNeighbourhood).toHaveBeenCalledWith(
      polygon,
      metadata,
    );
  });

  it('should call updateNeighbourhoodPolygon', async () => {
    const polygon = { type: 'Polygon', coordinates: [] } as any;

    (neo4jGeoService.updateNeighbourhoodPolygon as jest.Mock).mockResolvedValue(
      { id: 'nb1' },
    );

    const result = await controller.updateNeighbourhoodPolygon('nb1', {
      polygon,
    });
    expect(result).toEqual({ id: 'nb1' });
    expect(neo4jGeoService.updateNeighbourhoodPolygon).toHaveBeenCalledWith(
      'nb1',
      polygon,
    );
  });

  it('should throw BadRequest if data is missing on create', async () => {
    await expect(controller.createNeighbourhood({} as any)).rejects.toThrow(
      BadRequestException,
    );
  });
});
