import fc from 'fast-check';
import { Neo4jGeoService } from '../../neo4j-geo.service';
import { Neo4jService } from '../../../../database/neo4j/neo4j.service';

describe('Property 13: Invalid Polygon Rejection', () => {
  let neo4jGeoService: Neo4jGeoService;

  beforeEach(() => {
    neo4jGeoService = new Neo4jGeoService(
      {} as Neo4jService,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should reject invalid polygons', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant({ type: 'Point', coordinates: [0, 0] }),
          fc.constant({
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          }),
          fc.constant({
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
              ],
            ],
          }),
        ),
        async (invalidPoly: any) => {
          await expect(
            neo4jGeoService.createNeighbourhood(
              invalidPoly as GeoJSON.Polygon,
              {} as any,
            ),
          ).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});
