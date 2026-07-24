import fc from 'fast-check';
import * as turf from '@turf/turf';

describe('Property 6: Point-in-Polygon Correctness', () => {
  it('turf.booleanPointInPolygon should correctly identify interior vs exterior points', () => {
    fc.assert(
      fc.property(
        fc.constant(
          turf.polygon([
            [
              [-10, -10],
              [10, -10],
              [10, 10],
              [-10, 10],
              [-10, -10],
            ],
          ]),
        ),
        fc.double({ min: -9.9, max: 9.9, noNaN: true }), // lng inside
        fc.double({ min: -9.9, max: 9.9, noNaN: true }), // lat inside
        fc.double({ min: 10.1, max: 20, noNaN: true }), // lng outside
        fc.double({ min: 10.1, max: 20, noNaN: true }), // lat outside
        (poly, lngIn, latIn, lngOut, latOut) => {
          const ptIn = turf.point([lngIn, latIn]);
          const ptOut = turf.point([lngOut, latOut]);

          expect(turf.booleanPointInPolygon(ptIn, poly)).toBe(true);
          expect(turf.booleanPointInPolygon(ptOut, poly)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
