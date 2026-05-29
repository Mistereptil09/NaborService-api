import { Test, TestingModule } from '@nestjs/testing';
import { UnrecoverableError } from 'bullmq';
import { Neo4jSyncWorker } from '../neo4j-sync.worker';
import { Neo4jSyncService } from '../../../database/neo4j/neo4j-sync.service';

describe('Neo4jSyncWorker', () => {
  let worker: Neo4jSyncWorker;
  const mockNeo4jSyncService = {
    upsertUser: jest.fn(),
    upsertListing: jest.fn(),
    upsertEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Neo4jSyncWorker,
        { provide: Neo4jSyncService, useValue: mockNeo4jSyncService },
      ],
    }).compile();

    worker = module.get<Neo4jSyncWorker>(Neo4jSyncWorker);
    jest.clearAllMocks();
  });

  it('should dispatch upsert-user correctly', async () => {
    const job = { data: { operation: 'upsert-user', data: { pgId: '123' } } } as any;
    await worker.process(job);
    expect(mockNeo4jSyncService.upsertUser).toHaveBeenCalledWith({ pgId: '123' });
  });

  it('should dispatch upsert-listing correctly', async () => {
    const now = new Date();
    const job = { data: { operation: 'upsert-listing', data: { pgId: '456', createdAt: now.toISOString() } } } as any;
    await worker.process(job);
    expect(mockNeo4jSyncService.upsertListing).toHaveBeenCalledWith(expect.objectContaining({ pgId: '456' }));
  });

  it('should throw UnrecoverableError for non-transient errors', async () => {
    mockNeo4jSyncService.upsertUser.mockRejectedValue(new Error('Validation failed: invalid input'));
    const job = { data: { operation: 'upsert-user', data: { pgId: '123' } } } as any;
    await expect(worker.process(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should re-throw transient errors', async () => {
    mockNeo4jSyncService.upsertUser.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:7687'));
    const job = { data: { operation: 'upsert-user', data: { pgId: '123' } } } as any;
    await expect(worker.process(job)).rejects.toThrow('ECONNREFUSED 127.0.0.1:7687');
  });
});
