import * as fc from 'fast-check';
import { Neo4jService } from '../../neo4j.service';
import { Driver, Session } from 'neo4j-driver';

describe('Feature: neo4j-init-service, Property 2: Retry with exponential backoff', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should retry transient errors and eventually succeed or exhaust retries', async () => {
    jest.useFakeTimers();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }), // number of failures before success (4 means always fail)
        async (failuresBeforeSuccess) => {
          const transientError = {
            code: 'Neo.TransientError.General.DatabaseUnavailable',
            message: 'Transient error',
          };

          const mockSession = {
            run: jest.fn(),
            close: jest.fn().mockResolvedValue(undefined),
          } as unknown as jest.Mocked<Session>;

          const mockDriver = {
            session: jest.fn().mockReturnValue(mockSession),
            close: jest.fn(),
          } as unknown as jest.Mocked<Driver>;

          const service = new Neo4jService(mockDriver);

          // Setup mocked run implementations
          let calls = 0;
          mockSession.run.mockImplementation((async () => {
            if (calls < failuresBeforeSuccess) {
              calls++;
              throw transientError;
            }
            return { records: [], summary: {} as any };
          }) as any);

          const runPromise = service.run('RETURN 1');
          runPromise.catch(() => {});

          // If failures < 4, it should eventually succeed
          if (failuresBeforeSuccess < 4) {
            // Advance timers incrementally for each expected transient retry
            for (let i = 0; i < failuresBeforeSuccess; i++) {
              const delay = i === 0 ? 1000 : i === 1 ? 5000 : 30000;
              await jest.advanceTimersByTimeAsync(delay);
            }
            const result = await runPromise;
            expect(result).toBeDefined();
            expect(mockSession.run).toHaveBeenCalledTimes(
              failuresBeforeSuccess + 1,
            );
          } else {
            // If failures >= 4, it will exhaust all 3 retries (4 total attempts)
            for (let i = 0; i < 3; i++) {
              const delay = i === 0 ? 1000 : i === 1 ? 5000 : 30000;
              await jest.advanceTimersByTimeAsync(delay);
            }
            await expect(runPromise).rejects.toEqual(transientError);
            expect(mockSession.run).toHaveBeenCalledTimes(4);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
