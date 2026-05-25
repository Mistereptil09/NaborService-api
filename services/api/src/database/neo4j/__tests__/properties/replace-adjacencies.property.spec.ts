import * as fc from 'fast-check';
import { NeighbourhoodService } from '../../neighbourhood.service';
import { Neo4jService } from '../../neo4j.service';

describe('Feature: neo4j-init-service, Property 9: replaceAdjacencies atomicity and completeness', () => {
  let mockNeo4jService: jest.Mocked<Neo4jService>;
  let service: NeighbourhoodService;

  beforeEach(() => {
    mockNeo4jService = {
      runInTransaction: jest.fn(),
    } as unknown as jest.Mocked<Neo4jService>;

    service = new NeighbourhoodService(mockNeo4jService);
  });

  it('should run exist check, delete, and unwound creations inside a single transaction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // pgId
        fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 20 }), // adjacent IDs
        async (pgId, adjacentPgIds) => {
          mockNeo4jService.runInTransaction.mockReset();

          const mockTx = {
            run: jest
              .fn()
              .mockResolvedValueOnce({ records: [{}] } as any) // exist: yes
              .mockResolvedValue({ records: [] } as any), // others
          };

          mockNeo4jService.runInTransaction.mockImplementationOnce(async (work) => {
            return work(mockTx as any);
          });

          await service.replaceAdjacencies(pgId, adjacentPgIds);

          expect(mockNeo4jService.runInTransaction).toHaveBeenCalledTimes(1);

          expect(mockTx.run.mock.calls[0][0]).toContain('MATCH (n:Neighbourhood { pg_id: $pgId }) RETURN n');
          expect(mockTx.run.mock.calls[1][0]).toContain('MATCH (n:Neighbourhood { pg_id: $pgId })-[r:ADJACENT_TO]-() DELETE r');

          if (adjacentPgIds.length > 0) {
            expect(mockTx.run).toHaveBeenCalledTimes(3);
            const createCall = mockTx.run.mock.calls[2];
            expect(createCall[0]).toContain('UNWIND $adjacentPgIds as adjId');
            expect(createCall[1]).toEqual({ pgId, adjacentPgIds });
          } else {
            expect(mockTx.run).toHaveBeenCalledTimes(2);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
