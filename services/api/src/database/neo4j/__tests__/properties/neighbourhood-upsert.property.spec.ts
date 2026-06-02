import * as fc from 'fast-check';
import { NeighbourhoodService } from '../../neighbourhood.service';
import { Neo4jService } from '../../neo4j.service';

describe('Feature: neo4j-init-service, Property 6: Neighbourhood upsert preserves created_at on update', () => {
  let mockNeo4jService: jest.Mocked<Neo4jService>;
  let service: NeighbourhoodService;

  beforeEach(() => {
    mockNeo4jService = {
      run: jest.fn().mockResolvedValue({ records: [] }),
    } as unknown as jest.Mocked<Neo4jService>;

    service = new NeighbourhoodService(mockNeo4jService);
  });

  it('should generate Cypher that maps point centroid and sets timestamps correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          pgId: fc.string({ minLength: 1 }),
          name: fc.string({ minLength: 1 }),
          city: fc.string({ minLength: 1 }),
          zipCode: fc.string({ minLength: 1 }),
          country: fc.string({ minLength: 1 }),
          latitude: fc.float({ min: -90, max: 90 }),
          longitude: fc.float({ min: -180, max: 180 }),
          geometry: fc.string({ minLength: 1 }),
          areaM2: fc.integer({ min: 0 }),
        }),
        async (dto) => {
          mockNeo4jService.run.mockClear();

          await service.upsert(dto);

          expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
          const [cypher, params] = mockNeo4jService.run.mock.calls[0];

          // Structural validation
          expect(cypher).toContain('MERGE (n:Neighbourhood { pg_id: $pgId })');
          expect(cypher).toContain('n.centroid = point({latitude: $latitude, longitude: $longitude, crs: \'wgs-84\'})');
          expect(cypher).toContain('n.created_at = datetime()');
          expect(cypher).toContain('n.updated_at = datetime()');

          // Parameter matching
          expect(params!.pgId).toBe(dto.pgId);
          expect(params!.latitude).toBe(dto.latitude);
          expect(params!.longitude).toBe(dto.longitude);
        },
      ),
      { numRuns: 100 },
    );
  });
});
