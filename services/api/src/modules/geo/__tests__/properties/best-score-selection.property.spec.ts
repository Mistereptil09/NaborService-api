import fc from 'fast-check';
import { parseFeatureCollection } from '../../geojson-parser';

// Feature: geographical-pipeline, Property 2: Best-Score Feature Selection
describe('Property 2: Best-Score Feature Selection', () => {
  it('should select features sorted by score descending', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constant('Feature'),
            geometry: fc.record({
              type: fc.constant('Point'),
              coordinates: fc.tuple(
                fc.double({ noNaN: true, min: -180, max: 180 }),
                fc.double({ noNaN: true, min: -90, max: 90 }),
              ),
            }),
            properties: fc.record({
              score: fc.double({ noNaN: true, min: 0, max: 1 }),
              label: fc.string(),
            }),
          }),
          { minLength: 1 },
        ),
        (features) => {
          const raw = {
            type: 'FeatureCollection',
            features,
          };

          const result = parseFeatureCollection(raw);

          // Verify that it parsed successfully and has the same length
          expect(result.length).toBe(features.length);

          // Verify sorting (descending)
          for (let i = 0; i < result.length - 1; i++) {
            expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
