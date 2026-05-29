import fc from 'fast-check';
import { Neo4jGeoService } from '../../neo4j-geo.service';
import { Neo4jService } from '../../../../neo4j/neo4j.service';

// Feature: geographical-pipeline, Property 13: Invalid Polygon Rejection
describe('Property 13: Invalid Polygon Rejection', () => {
  let neo4jGeoService: Neo4jGeoService;

  beforeEach(() => {
    neo4jGeoService = new Neo4jGeoService({} as Neo4jService);
  });

  it('should reject invalid polygons', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Not a polygon
          fc.constant({ type: 'Point', coordinates: [0,0] }),
          // Too few positions (< 4)
          fc.constant({ type: 'Polygon', coordinates: [[[0,0], [1,1], [0,0]]] }),
          // Unclosed ring
          fc.constant({ type: 'Polygon', coordinates: [[[0,0], [1,0], [1,1], [0,1]]] })
        ),
        async (invalidPoly: any) => {
          await expect(
            neo4jGeoService.createNeighbourhood(invalidPoly as GeoJSON.Polygon, {} as any)
          ).rejects.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
