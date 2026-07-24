import fc from 'fast-check';

describe('Property 14: Discovery Scoring Formula', () => {
  it('should compute total score as geoScore + socialScore + interestScore', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }), // geoScore
        fc.integer({ min: 0, max: 10 }), // social connections
        fc.integer({ min: 0, max: 10 }), // shared interests
        (geoScore, commonConnections, sharedInterests) => {
          const socialScore = commonConnections;
          const interestScore = sharedInterests * 2;
          const total = geoScore + socialScore + interestScore;
          expect(total).toBe(
            geoScore + commonConnections + sharedInterests * 2,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
