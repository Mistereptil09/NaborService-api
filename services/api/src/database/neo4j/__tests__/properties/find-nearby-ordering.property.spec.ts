import * as fc from 'fast-check';
import { NeighbourhoodService } from '../../neighbourhood.service';
import { Neo4jService } from '../../neo4j.service';

describe('Feature: neo4j-init-service, Property 8: findNearby returns sorted and capped results', () => {
  let mockNeo4jService: jest.Mocked<Neo4jService>;
  let service: NeighbourhoodService;

  beforeEach(() => {
    mockNeo4jService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<Neo4jService>;

    service = new NeighbourhoodService(mockNeo4jService);
  });

  it('should formulate Point-based distance queries and map parameters correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: -90, max: 90 }), // lat
        fc.float({ min: -180, max: 180 }), // lng
        fc.integer({ min: 1, max: 50000 }), // radius
        async (lat, lng, radiusMeters) => {
          mockNeo4jService.run.mockReset();
          mockNeo4jService.run.mockResolvedValueOnce({ records: [] } as any);

          await service.findNearby(lat, lng, radiusMeters);

          expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
          const [cypher, params] = mockNeo4jService.run.mock.calls[0];

          expect(cypher).toContain('point({latitude: $lat, longitude: $lng, crs: \'wgs-84\'})');
          expect(cypher).toContain('point.distance(n.centroid, queryPoint) <= $radiusMeters');
          expect(cypher).toContain('ORDER BY distanceMeters ASC');
          expect(cypher).toContain('LIMIT 5');

          expect(params).toEqual({ lat, lng, radiusMeters });
        },
      ),
      { numRuns: 100 },
    );
  });
});
