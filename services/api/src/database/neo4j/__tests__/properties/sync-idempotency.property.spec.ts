import * as fc from 'fast-check';
import { Neo4jSyncService } from '../../neo4j-sync.service';
import { Neo4jService } from '../../neo4j.service';

describe('Feature: neo4j-init-service, Property 5: Sync upsert idempotency', () => {
  let mockNeo4jService: jest.Mocked<Neo4jService>;
  let service: Neo4jSyncService;

  beforeEach(() => {
    mockNeo4jService = {
      run: jest.fn().mockResolvedValue({ records: [] }),
    } as unknown as jest.Mocked<Neo4jService>;

    service = new Neo4jSyncService(mockNeo4jService);
  });

  it('should generate Cypher utilizing MERGE by pg_id for any User upsert DTO', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          pgId: fc.string({ minLength: 1 }),
          neighbourhoodId: fc.option(fc.string({ minLength: 1 })),
          visibility: fc.oneof(fc.constant('public'), fc.constant('friends'), fc.constant('private')),
          role: fc.oneof(
            fc.constant('resident'),
            fc.constant('neighbourhood_rep'),
            fc.constant('moderator'),
            fc.constant('admin'),
          ),
        }),
        async (dto) => {
          mockNeo4jService.run.mockClear();

          await service.upsertUser(dto as any);

          expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
          const [cypher, params] = mockNeo4jService.run.mock.calls[0];
          expect(cypher).toContain('MERGE (u:User { pg_id: $pgId })');
          expect(params!.pgId).toBe(dto.pgId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should generate Cypher utilizing MERGE by pg_id for any Listing upsert DTO', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          pgId: fc.string({ minLength: 1 }),
          listingType: fc.oneof(fc.constant('offer'), fc.constant('request')),
          status: fc.string({ minLength: 1 }),
          neighbourhoodId: fc.option(fc.string({ minLength: 1 })),
          createdAt: fc.integer({ min: 1600000000000, max: 1900000000000 }).map(t => new Date(t)),
        }),
        async (dto) => {
          mockNeo4jService.run.mockClear();

          await service.upsertListing(dto as any);

          expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
          const [cypher, params] = mockNeo4jService.run.mock.calls[0];
          expect(cypher).toContain('MERGE (l:Listing { pg_id: $pgId })');
          expect(params!.pgId).toBe(dto.pgId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should generate Cypher utilizing MERGE by pg_id for any Event upsert DTO', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          pgId: fc.string({ minLength: 1 }),
          status: fc.string({ minLength: 1 }),
          neighbourhoodId: fc.option(fc.string({ minLength: 1 })),
          startsAt: fc.integer({ min: 1600000000000, max: 1900000000000 }).map(t => new Date(t)),
          costCents: fc.integer(),
        }),
        async (dto) => {
          mockNeo4jService.run.mockClear();

          await service.upsertEvent(dto as any);

          expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
          const [cypher, params] = mockNeo4jService.run.mock.calls[0];
          expect(cypher).toContain('MERGE (e:Event { pg_id: $pgId })');
          expect(params!.pgId).toBe(dto.pgId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
