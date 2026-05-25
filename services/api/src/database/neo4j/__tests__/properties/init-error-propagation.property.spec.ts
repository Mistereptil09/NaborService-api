import * as fc from 'fast-check';
import { Neo4jInitService } from '../../neo4j-init.service';
import { Neo4jService } from '../../neo4j.service';
import { Driver } from 'neo4j-driver';
import { INDEX_EXISTS_CODE } from '../../neo4j.constants';

describe('Feature: neo4j-init-service, Property 4: Non-"already exists" errors propagate', () => {
  it('should propagate any error that is not the duplicate schema exists code', async () => {
    const mockDriver = {
      verifyConnectivity: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Driver>;

    await fc.assert(
      fc.asyncProperty(
        fc
          .string()
          .filter((code) => code !== INDEX_EXISTS_CODE && code !== 'Neo.TransientError.General.DatabaseUnavailable'),
        async (errorCode) => {
          const schemaError = {
            code: errorCode,
            message: 'Index creation failed',
          };

          const mockNeo4jService = {
            run: jest.fn().mockRejectedValue(schemaError),
          } as unknown as jest.Mocked<Neo4jService>;

          const service = new Neo4jInitService(mockDriver, mockNeo4jService);

          // Must fail and propagate the error
          await expect(service.onModuleInit()).rejects.toEqual(schemaError);
        },
      ),
      { numRuns: 100 },
    );
  });
});
