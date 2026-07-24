import fc from 'fast-check';
import { parseFeatureCollection } from '../../geojson-parser';
import { BanParseException } from '../../ban.service';

describe('Property 15: GeoJSON FeatureCollection Validation', () => {
  it('should throw BanParseException with truncated body for invalid inputs', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.record({ type: fc.string() }),
          fc.record({
            type: fc.constant('FeatureCollection'),
            features: fc.object(),
          }),
        ),
        (invalidInput) => {
          expect(() => parseFeatureCollection(invalidInput)).toThrow(
            BanParseException,
          );

          try {
            parseFeatureCollection(invalidInput);
          } catch (error) {
            expect(error.message).toContain(
              'Invalid GeoJSON FeatureCollection',
            );
            expect(error.message.length).toBeLessThanOrEqual(
              500 + 'Invalid GeoJSON FeatureCollection: '.length,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
