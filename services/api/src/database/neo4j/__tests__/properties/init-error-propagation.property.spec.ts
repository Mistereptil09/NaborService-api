import * as fc from 'fast-check';
import { Neo4jInitService } from '../../neo4j-init.service';
import { Neo4jService } from '../../neo4j.service';
import { Driver } from 'neo4j-driver';
import { INDEX_EXISTS_CODE } from '../../neo4j.constants';

describe('Feature: neo4j-init-service, Property 4: Non-"already exists" errors are swallowed', () => {
  it('should log warning and continue for any non-duplicate index error', async () => {
    const mockDriver = {
      verifyConnectivity: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Driver>;

    await fc.assert(
      fc.asyncProperty(
        fc
          .string()
          .filter(
            (code) =>
              code !== INDEX_EXISTS_CODE &&
              code !== 'Neo.TransientError.General.DatabaseUnavailable',
          ),
        async (errorCode) => {
          const schemaError = {
            code: errorCode,
            message: 'Index creation failed',
          };

          const mockNeo4jService = {
            run: jest.fn().mockRejectedValue(schemaError),
          } as unknown as jest.Mocked<Neo4jService>;

          const service = new Neo4jInitService(mockDriver, mockNeo4jService);

          // Should NOT throw — logs warning and continues
          await expect(service.onModuleInit()).resolves.toBeUndefined();
          expect(mockNeo4jService.run).toHaveBeenCalledTimes(10);
        },
      ),
      { numRuns: 100 },
    );
  });
});
