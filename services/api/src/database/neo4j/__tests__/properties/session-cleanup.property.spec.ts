import * as fc from 'fast-check';
import { Neo4jService } from '../../neo4j.service';
import { Driver, Session } from 'neo4j-driver';

describe('Feature: neo4j-init-service, Property 1: Session cleanup', () => {
  it('should guarantee session closure exactly once for any query outcome', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (isSuccess) => {
        const mockSession = {
          run: isSuccess
            ? jest.fn().mockResolvedValue({ records: [] })
            : jest.fn().mockRejectedValue(new Error('Query failed')),
          close: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<Session>;

        const mockDriver = {
          session: jest.fn().mockReturnValue(mockSession),
          close: jest.fn(),
        } as unknown as jest.Mocked<Driver>;

        const service = new Neo4jService(mockDriver);

        try {
          await service.run('RETURN 1');
        } catch (err) {
          // ignored
        }

        expect(mockSession.close).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 100 },
    );
  });
});
