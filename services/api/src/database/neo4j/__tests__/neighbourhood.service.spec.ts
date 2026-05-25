import { NeighbourhoodService } from '../neighbourhood.service';
import { Neo4jService } from '../neo4j.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('NeighbourhoodService', () => {
  let service: NeighbourhoodService;
  let mockNeo4jService: jest.Mocked<Neo4jService>;

  beforeEach(() => {
    mockNeo4jService = {
      run: jest.fn().mockResolvedValue({ records: [] }),
      runInTransaction: jest.fn(),
    } as unknown as jest.Mocked<Neo4jService>;

    service = new NeighbourhoodService(mockNeo4jService);
  });

  describe('upsert', () => {
    it('should run Cypher merge with POINT centroid and timestamps', async () => {
      const dto = {
        pgId: 'hood_123',
        name: 'Belleville',
        city: 'Paris',
        zipCode: '75020',
        country: 'France',
        latitude: 48.8712,
        longitude: 2.3861,
        geometry: '{"type":"Polygon"}',
        areaM2: 120000,
      };

      await service.upsert(dto);

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
      const [cypher, params] = mockNeo4jService.run.mock.calls[0];
      expect(cypher).toContain('MERGE (n:Neighbourhood { pg_id: $pgId })');
      expect(cypher).toContain("point({latitude: $latitude, longitude: $longitude, crs: 'wgs-84'})");
      expect(params).toEqual({
        pgId: 'hood_123',
        name: 'Belleville',
        city: 'Paris',
        zipCode: '75020',
        country: 'France',
        latitude: 48.8712,
        longitude: 2.3861,
        geometry: '{"type":"Polygon"}',
        areaM2: 120000,
      });
    });
  });

  describe('findByPgId', () => {
    it('should return null if neighbourhood not found', async () => {
      mockNeo4jService.run.mockResolvedValueOnce({ records: [] } as any);

      const result = await service.findByPgId('hood_123');

      expect(result).toBeNull();
    });

    it('should correctly map properties and parse Neo4j Point centroid', async () => {
      const mockRecord = {
        get: (key: string) => {
          if (key === 'n') {
            return {
              properties: {
                pg_id: 'hood_123',
                name: 'Belleville',
                city: 'Paris',
                zip_code: '75020',
                country: 'France',
                centroid: { latitude: 48.8712, longitude: 2.3861 },
                geometry: '{"type":"Polygon"}',
                area_m2: 120000,
                created_at: '2026-05-25T18:00:00Z',
                updated_at: '2026-05-25T18:05:00Z',
              },
            };
          }
          if (key === 'adjacentIds') {
            return ['hood_456'];
          }
          return null;
        },
      };

      mockNeo4jService.run.mockResolvedValueOnce({ records: [mockRecord] } as any);

      const result = await service.findByPgId('hood_123');

      expect(result).toEqual({
        pgId: 'hood_123',
        name: 'Belleville',
        city: 'Paris',
        zipCode: '75020',
        country: 'France',
        centroid: { latitude: 48.8712, longitude: 2.3861 },
        geometry: '{"type":"Polygon"}',
        areaM2: 120000,
        createdAt: new Date('2026-05-25T18:00:00Z'),
        updatedAt: new Date('2026-05-25T18:05:00Z'),
        adjacentIds: ['hood_456'],
      });
    });
  });

  describe('findNearby', () => {
    it('should execute spatial query returning distance-sorted results', async () => {
      const mockRecord = {
        get: (key: string) => {
          const props: any = {
            pgId: 'hood_123',
            name: 'Belleville',
            city: 'Paris',
            distanceMeters: 520.5,
          };
          return props[key];
        },
      };

      mockNeo4jService.run.mockResolvedValueOnce({ records: [mockRecord] } as any);

      const result = await service.findNearby(48.87, 2.38, 1000);

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
      const [cypher, params] = mockNeo4jService.run.mock.calls[0];
      expect(cypher).toContain('point.distance(n.centroid, queryPoint)');
      expect(params).toEqual({ lat: 48.87, lng: 2.38, radiusMeters: 1000 });
      expect(result).toEqual([
        {
          pgId: 'hood_123',
          name: 'Belleville',
          city: 'Paris',
          distanceMeters: 520.5,
        },
      ]);
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if neighbourhood does not exist', async () => {
      mockNeo4jService.run.mockResolvedValueOnce({ records: [] } as any);

      await expect(service.delete('hood_123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if neighbourhood has active residents', async () => {
      const mockRecord = {
        get: () => 3, // residentCount
      };
      mockNeo4jService.run.mockResolvedValueOnce({ records: [mockRecord] } as any);

      await expect(service.delete('hood_123')).rejects.toThrow(ConflictException);
    });

    it('should detach delete if no active residents live there', async () => {
      const mockRecord = {
        get: () => 0, // residentCount
      };
      mockNeo4jService.run
        .mockResolvedValueOnce({ records: [mockRecord] } as any) // check query
        .mockResolvedValueOnce({ records: [] } as any); // delete query

      await service.delete('hood_123');

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(2);
      expect(mockNeo4jService.run.mock.calls[1][0]).toContain('DETACH DELETE n');
    });
  });

  describe('replaceAdjacencies', () => {
    it('should replace adjacencies inside a single transaction and throw NotFound on missing target', async () => {
      mockNeo4jService.runInTransaction.mockImplementationOnce(async (work) => {
        const mockTx = {
          run: jest.fn().mockResolvedValue({ records: [] }), // target does not exist
        };
        return work(mockTx as any);
      });

      await expect(service.replaceAdjacencies('hood_123', ['hood_456'])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should successfully run queries inside transaction if target exists', async () => {
      const mockTx = {
        run: jest
          .fn()
          .mockResolvedValueOnce({ records: [{}] } as any) // exist check: found
          .mockResolvedValue({ records: [] } as any), // others
      };

      mockNeo4jService.runInTransaction.mockImplementationOnce(async (work) => {
        return work(mockTx as any);
      });

      await service.replaceAdjacencies('hood_123', ['hood_456']);

      expect(mockTx.run).toHaveBeenCalledTimes(3);
      expect(mockTx.run.mock.calls[1][0]).toContain('ADJACENT_TO'); // delete
      expect(mockTx.run.mock.calls[2][0]).toContain('UNWIND $adjacentPgIds'); // create
    });
  });
});
