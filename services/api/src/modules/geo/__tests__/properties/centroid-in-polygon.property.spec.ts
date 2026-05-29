import fc from 'fast-check';
import * as turf from '@turf/turf';

// Feature: geographical-pipeline, Property 11: Centroid Within Convex Polygon
describe('Property 11: Centroid Within Convex Polygon (Metamorphic)', () => {
  it('should compute a centroid that falls inside the convex polygon', () => {
    fc.assert(
      fc.property(
        // A simple convex polygon generator
        fc.double({ min: 1, max: 10, noNaN: true }).chain(size => 
          fc.constant(turf.polygon([[[0, 0], [size, 0], [size, size], [0, size], [0, 0]]]))
        ),
        (poly) => {
          const centroid = turf.centroid(poly);
          // With JS floating point, points exactly on the boundary might be false, but inside is true
          expect(turf.booleanPointInPolygon(centroid, poly)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
