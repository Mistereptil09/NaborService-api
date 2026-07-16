import fc from 'fast-check';
import { Neo4jGeoService } from '../../neo4j-geo.service';
import { Neo4jService } from '../../../../database/neo4j/neo4j.service';

// Feature: geographical-pipeline, Property 8: GeoScore Assignment by Hop Distance
describe('Property 8: GeoScore by Hops', () => {
  let neo4jGeoService: Neo4jGeoService;

  beforeEach(() => {
    // Mock Neo4jService
    const mockNeo4jService = {
      run: jest.fn(),
    } as unknown as Neo4jService;
    neo4jGeoService = new Neo4jGeoService(
      mockNeo4jService,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should map hop distances to 3, 2, 1, 0 geoScores', async () => {
    // Same neighbourhood (0 hops)
    expect(await neo4jGeoService.computeGeoScore('nb1', 'nb1')).toBe(3);

    // 1 hop
    (neo4jGeoService['neo4jService'].run as jest.Mock).mockResolvedValueOnce({
      records: [{ get: () => 1 }],
    });
    expect(await neo4jGeoService.computeGeoScore('nb1', 'nb2')).toBe(2);

    // 2 hops
    (neo4jGeoService['neo4jService'].run as jest.Mock).mockResolvedValueOnce({
      records: [{ get: () => 2 }],
    });
    expect(await neo4jGeoService.computeGeoScore('nb1', 'nb3')).toBe(1);

    // 3+ hops or unreachable
    (neo4jGeoService['neo4jService'].run as jest.Mock).mockResolvedValueOnce({
      records: [],
    });
    expect(await neo4jGeoService.computeGeoScore('nb1', 'nb4')).toBe(0);
  });
});
