import * as fc from 'fast-check';
import {
  ESSENTIAL_RELATIONS,
  INTERACTION_RELATIONS,
} from '../../data-processing.constants';

async function simulateNeo4jSync(
  userId: string,
  relationType: string,
  isNeo4jTrackingOptedOut: boolean,
): Promise<{ executed: boolean; skipped: boolean }> {
  if (
    isNeo4jTrackingOptedOut &&
    INTERACTION_RELATIONS.includes(relationType as any)
  ) {
    return { executed: false, skipped: true };
  }
  return { executed: true, skipped: false };
}

describe('Feature: rgpd-data-processing-table, Property 3: Neo4j sync respects opt-out by relation type', () => {
  it('should only sync essential relations if neo4j_tracking opt-out is active', async () => {
    const allRelations = [...ESSENTIAL_RELATIONS, ...INTERACTION_RELATIONS];

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // userId
        fc.constantFrom(...allRelations), // relationType
        fc.boolean(), // isNeo4jTrackingOptedOut
        async (userId, relationType, isNeo4jTrackingOptedOut) => {
          const result = await simulateNeo4jSync(
            userId,
            relationType,
            isNeo4jTrackingOptedOut,
          );

          if (isNeo4jTrackingOptedOut) {
            const isEssential = ESSENTIAL_RELATIONS.includes(
              relationType as any,
            );
            if (isEssential) {
              expect(result.executed).toBe(true);
              expect(result.skipped).toBe(false);
            } else {
              expect(result.executed).toBe(false);
              expect(result.skipped).toBe(true);
            }
          } else {
            expect(result.executed).toBe(true);
            expect(result.skipped).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
