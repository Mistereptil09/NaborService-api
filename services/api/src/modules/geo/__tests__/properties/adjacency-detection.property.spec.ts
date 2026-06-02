import fc from 'fast-check';
import * as turf from '@turf/turf';

// Feature: geographical-pipeline, Property 12: Adjacency Detection
describe('Property 12: Adjacency Detection via Polygon Intersection', () => {
  it('should be adjacent if and only if polygons intersect', () => {
    fc.assert(
      fc.property(
        fc.constant(
          turf.polygon([
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ]),
        ),
        fc.constant(
          turf.polygon([
            [
              [1, 1],
              [3, 1],
              [3, 3],
              [1, 3],
              [1, 1],
            ],
          ]),
        ), // Intersects
        fc.constant(
          turf.polygon([
            [
              [3, 3],
              [5, 3],
              [5, 5],
              [3, 5],
              [3, 3],
            ],
          ]),
        ), // Disjoint
        (polyA, polyB_intersects, polyC_disjoint) => {
          expect(turf.booleanIntersects(polyA, polyB_intersects)).toBe(true);
          expect(turf.booleanIntersects(polyA, polyC_disjoint)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
