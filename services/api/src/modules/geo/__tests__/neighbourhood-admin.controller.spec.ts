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
            updateNeighbourhood: jest.fn(),
            deleteNeighbourhood: jest.fn(),
            checkOverlap: jest.fn(),
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

  it('should call createNeighbourhood with CDC-conformant DTO', async () => {
    const dto = {
      pg_id: 'nb1',
      name: 'Test',
      city: 'Paris',
      zip_code: '75001',
      country: 'FR',
      geometry: { type: 'Polygon', coordinates: [] } as any,
    };

    (neo4jGeoService.createNeighbourhood as jest.Mock).mockResolvedValue({
      id: 'nb1',
    });

    const result = await controller.createNeighbourhood(dto);
    expect(result).toEqual({ id: 'nb1' });
    expect(neo4jGeoService.createNeighbourhood).toHaveBeenCalledWith(
      dto.geometry,
      {
        pg_id: 'nb1',
        name: 'Test',
        city: 'Paris',
        zip_code: '75001',
        country: 'FR',
      },
    );
  });

  it('should call updateNeighbourhood', async () => {
    const dto = {
      name: 'Updated Name',
      city: 'Lyon',
    };

    (neo4jGeoService.updateNeighbourhood as jest.Mock).mockResolvedValue({
      pg_id: 'nb1',
      centroid: { latitude: 0, longitude: 0 },
      area_m2: 1000,
      adjacent_pg_ids: [],
    });

    const result = await controller.updateNeighbourhood('nb1', dto);
    expect(result.pg_id).toEqual('nb1');
    expect(neo4jGeoService.updateNeighbourhood).toHaveBeenCalledWith(
      'nb1',
      dto,
    );
  });

  it('should call deleteNeighbourhood', async () => {
    (neo4jGeoService.deleteNeighbourhood as jest.Mock).mockResolvedValue(
      undefined,
    );

    const result = await controller.deleteNeighbourhood('nb1');
    expect(result).toEqual({ success: true });
    expect(neo4jGeoService.deleteNeighbourhood).toHaveBeenCalledWith('nb1');
  });

  it('should call overlapCheck', async () => {
    const dto = {
      geometry: { type: 'Polygon', coordinates: [] } as any,
    };

    (neo4jGeoService.checkOverlap as jest.Mock).mockResolvedValue({
      overlapping: ['nb2'],
      adjacent: ['nb3'],
    });

    const result = await controller.overlapCheck(dto);
    expect(result).toEqual({ overlapping: ['nb2'], adjacent: ['nb3'] });
    expect(neo4jGeoService.checkOverlap).toHaveBeenCalledWith(dto.geometry);
  });
});
