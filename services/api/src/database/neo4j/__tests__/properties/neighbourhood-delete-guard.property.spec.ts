import * as fc from 'fast-check';
import { NeighbourhoodService } from '../../neighbourhood.service';
import { Neo4jService } from '../../neo4j.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('Feature: neo4j-init-service, Property 7: Neighbourhood deletion guard', () => {
  let mockNeo4jService: jest.Mocked<Neo4jService>;
  let service: NeighbourhoodService;

  beforeEach(() => {
    mockNeo4jService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<Neo4jService>;

    service = new NeighbourhoodService(mockNeo4jService);
  });

  it('should block deletion if residents > 0 and detach delete if 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100 }), // resident count
        async (residentCount) => {
          mockNeo4jService.run.mockReset();

          // Mock the exist & resident count check
          const mockRecord = {
            get: () => residentCount,
          };
          mockNeo4jService.run.mockResolvedValueOnce({
            records: [mockRecord],
          } as any); // first query: check
          mockNeo4jService.run.mockResolvedValueOnce({ records: [] } as any); // second query: delete

          if (residentCount > 0) {
            await expect(service.delete('hood_123')).rejects.toThrow(
              ConflictException,
            );
            expect(mockNeo4jService.run).toHaveBeenCalledTimes(1); // stopped at check
          } else {
            await service.delete('hood_123');
            expect(mockNeo4jService.run).toHaveBeenCalledTimes(2); // check + delete
            expect(mockNeo4jService.run.mock.calls[1][0]).toContain(
              'DETACH DELETE n',
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
