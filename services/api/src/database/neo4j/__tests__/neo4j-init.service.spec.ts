import { Neo4jInitService } from '../neo4j-init.service';
import { Neo4jService } from '../neo4j.service';
import { Driver } from 'neo4j-driver';
import { INDEX_EXISTS_CODE } from '../neo4j.constants';

describe('Neo4jInitService', () => {
  let service: Neo4jInitService;
  let mockDriver: jest.Mocked<Driver>;
  let mockNeo4jService: jest.Mocked<Neo4jService>;

  beforeEach(() => {
    mockDriver = {
      verifyConnectivity: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Driver>;

    mockNeo4jService = {
      run: jest.fn().mockResolvedValue({ records: [], summary: {} as any }),
    } as unknown as jest.Mocked<Neo4jService>;

    service = new Neo4jInitService(mockDriver, mockNeo4jService);
  });

  it('should verify connection and create all 10 indexes successfully on startup', async () => {
    await service.onModuleInit();

    expect(mockDriver.verifyConnectivity).toHaveBeenCalledTimes(1);
    expect(mockNeo4jService.run).toHaveBeenCalledTimes(10); // 10 indexes total
  });

  it('should log warning and skip index creation if driver connectivity fails', async () => {
    mockDriver.verifyConnectivity.mockRejectedValueOnce(
      new Error('Connection failed'),
    );

    await service.onModuleInit();

    expect(mockNeo4jService.run).not.toHaveBeenCalled();
  });

  it('should gracefully skip pre-existing indexes and continue bootstrapping', async () => {
    const skipError = {
      code: INDEX_EXISTS_CODE,
      message: 'Equivalent schema already exists',
    };

    mockNeo4jService.run
      .mockResolvedValue({ records: [], summary: {} as any }) // default resolve
      .mockRejectedValueOnce(skipError) // first index already exists
      .mockRejectedValueOnce(skipError); // second index already exists

    await service.onModuleInit();

    expect(mockNeo4jService.run).toHaveBeenCalledTimes(10);
  });

  it('should log warning and continue if an index creation fails for a non-duplicate reason', async () => {
    const randomError = new Error('Syntax error or permission denied');
    mockNeo4jService.run.mockRejectedValueOnce(randomError);

    await service.onModuleInit();

    expect(mockNeo4jService.run).toHaveBeenCalledTimes(10); // continues through all indexes
  });
});
