import fc from 'fast-check';
import { parseFeatureCollection } from '../../geojson-parser';

// Feature: geographical-pipeline, Property 4: GeoJSON Coordinate Extraction Preserves Precision and Order
describe('Property 4: Coordinate Precision', () => {
  it('should extract exact precision values and [lng, lat] order', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, min: -180, max: 180 }), // lng
        fc.double({ noNaN: true, min: -90, max: 90 }),   // lat
        (lng, lat) => {
          const raw = {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [lng, lat],
                },
                properties: {
                  score: 0.8,
                },
              }
            ],
          };
          
          const result = parseFeatureCollection(raw);
          
          expect(result.length).toBe(1);
          expect(result[0].longitude).toStrictEqual(lng);
          expect(result[0].latitude).toStrictEqual(lat);
        }
      ),
      { numRuns: 100 }
    );
  });
});
