import fc from 'fast-check';
import { parseFeatureCollection } from '../../geojson-parser';

describe('Property 5: Invalid Features Are Skipped', () => {
  it('should exclude features with missing/invalid geometry or out-of-range coordinates', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({ type: fc.constant('Feature') }),
            fc.record({
              type: fc.constant('Feature'),
              geometry: fc.record({ type: fc.constant('Point') }),
            }),
            fc.record({
              type: fc.constant('Feature'),
              geometry: fc.record({
                type: fc.constant('Point'),
                coordinates: fc.tuple(fc.string(), fc.string()),
              }),
            }),
            fc.record({
              type: fc.constant('Feature'),
              geometry: fc.record({
                type: fc.constant('Point'),
                coordinates: fc.tuple(
                  fc.double({ min: -180, max: 180 }),
                  fc.oneof(
                    fc.double({ max: -90.0001 }),
                    fc.double({ min: 90.0001 }),
                  ),
                ),
              }),
            }),
            fc.record({
              type: fc.constant('Feature'),
              geometry: fc.record({
                type: fc.constant('Point'),
                coordinates: fc.tuple(
                  fc.oneof(
                    fc.double({ max: -180.0001 }),
                    fc.double({ min: 180.0001 }),
                  ),
                  fc.double({ min: -90, max: 90 }),
                ),
              }),
            }),
          ),
        ),
        (invalidFeatures) => {
          const raw = {
            type: 'FeatureCollection',
            features: invalidFeatures,
          };

          const result = parseFeatureCollection(raw);

          expect(result.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
