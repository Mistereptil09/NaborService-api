import * as fc from 'fast-check';
import { Neo4jInitService } from '../../neo4j-init.service';
import { Neo4jService } from '../../neo4j.service';
import { Driver } from 'neo4j-driver';
import { INDEX_EXISTS_CODE } from '../../neo4j.constants';

describe('Feature: neo4j-init-service, Property 3: Init service graceful skip of existing indexes', () => {
  it('should skip already existing indexes and successfully create others', async () => {
    const mockDriver = {
      verifyConnectivity: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Driver>;

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 9 }), {
          minLength: 0,
          maxLength: 10,
        }), // indices of skipped indexes
        async (skippedIndexes) => {
          const uniqueSkips = Array.from(new Set(skippedIndexes));

          const mockNeo4jService = {
            run: jest.fn().mockImplementation(async (cypher: string) => {
              // Extract the index name from the Cypher query: CREATE RANGE INDEX index_name ...
              const match = cypher.match(/INDEX\s+(\w+)\s+IF/i);
              const name = match ? match[1] : '';

              // Find if this index name corresponds to a skipped one
              // INDEX_DEFINITIONS names are: user_pg_id (idx 0), listing_pg_id (idx 1), etc.
              const names = [
                'user_pg_id',
                'listing_pg_id',
                'event_pg_id',
                'neighbourhood_id',
                'neighbourhood_city',
                'category_pg_id',
                'listing_status_date',
                'event_status_date',
                'user_visibility',
                'neighbourhood_centroid',
              ];
              const idx = names.indexOf(name);

              if (idx !== -1 && uniqueSkips.includes(idx)) {
                throw {
                  code: INDEX_EXISTS_CODE,
                  message: 'Equivalent schema already exists',
                };
              }
              return { records: [] };
            }),
          } as unknown as jest.Mocked<Neo4jService>;

          const service = new Neo4jInitService(mockDriver, mockNeo4jService);

          // Should succeed
          await service.onModuleInit();

          expect(mockNeo4jService.run).toHaveBeenCalledTimes(10);
        },
      ),
      { numRuns: 100 },
    );
  });
});
