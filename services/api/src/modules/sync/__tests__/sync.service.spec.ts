import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SyncService } from '../sync.service';
import { EntityPatchHandler, PatchResult } from '../handlers/entity-patch.handler';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { SyncConflict } from '../entities/sync-conflict.entity';
import { SyncUpdatesBatchDto, SyncUpdateItemDto } from '../dto/sync-push.dto';
import { User } from '../../users/entities/user.entity';
import { Incident } from '../../incidents/entities/incident.entity';
import { Listing } from '../../listings/entities/listing.entity';
import { Evenement } from '../../events/entities/evenement.entity';
import { ListingModerationAction } from '../../listings/entities/listing-moderation-action.entity';
import { EventModerationAction } from '../../events/entities/event-moderation-action.entity';
import { ListingReport } from '../../listings/entities/listing-report.entity';
import { EventReport } from '../../events/entities/event-report.entity';
import { ListingTransaction } from '../../listings/entities/listing-transaction.entity';
import { ChatGroup } from '../../messaging/entities/chat-group.entity';
import { Poll } from '../../polls/entities/poll.entity';
import { Vote } from '../../polls/entities/vote.entity';
import { Neo4jService } from '../../../database/neo4j';

describe('SyncService', () => {
  let service: SyncService;
  let redisClient: any;
  let entityPatchHandler: jest.Mocked<EntityPatchHandler>;
  let syncConflictRepository: any;

  const mockRepository = () => ({
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
  });

  beforeEach(async () => {
    redisClient = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: REDIS_CLIENT, useValue: redisClient },
        { provide: Neo4jService, useValue: {} },
        {
          provide: EntityPatchHandler,
          useValue: { handlePatch: jest.fn() },
        },
        { provide: getRepositoryToken(SyncConflict), useFactory: mockRepository },
        { provide: getRepositoryToken(User), useFactory: mockRepository },
        { provide: getRepositoryToken(Incident), useFactory: mockRepository },
        { provide: getRepositoryToken(Listing), useFactory: mockRepository },
        { provide: getRepositoryToken(Evenement), useFactory: mockRepository },
        { provide: getRepositoryToken(ListingModerationAction), useFactory: mockRepository },
        { provide: getRepositoryToken(EventModerationAction), useFactory: mockRepository },
        { provide: getRepositoryToken(ListingReport), useFactory: mockRepository },
        { provide: getRepositoryToken(EventReport), useFactory: mockRepository },
        { provide: getRepositoryToken(ListingTransaction), useFactory: mockRepository },
        { provide: getRepositoryToken(ChatGroup), useFactory: mockRepository },
        { provide: getRepositoryToken(Poll), useFactory: mockRepository },
        { provide: getRepositoryToken(Vote), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
    entityPatchHandler = module.get(EntityPatchHandler);
    syncConflictRepository = module.get(getRepositoryToken(SyncConflict));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return cached response if idempotence check passes', async () => {
    const cachedData = { success: true, message: 'From Cache' };
    redisClient.get.mockResolvedValue(JSON.stringify(cachedData));

    const dto = new SyncUpdatesBatchDto();
    dto.jobId = '1234';
    dto.updates = [];

    const result = await service.syncUpdates(dto);
    expect(result).toEqual(cachedData);
    expect(entityPatchHandler.handlePatch).not.toHaveBeenCalled();
  });

  it('should process updates, store conflicts, and cache response', async () => {
    redisClient.get.mockResolvedValue(null); // Not cached

    const update1 = new SyncUpdateItemDto();
    update1.entity_type = 'user';
    update1.entity_id = 'user1';
    
    const update2 = new SyncUpdateItemDto();
    update2.entity_type = 'listing';
    update2.entity_id = 'list1';

    const dto = new SyncUpdatesBatchDto();
    dto.jobId = 'job-567';
    dto.updates = [update1, update2];

    entityPatchHandler.handlePatch
      .mockResolvedValueOnce({ status: 'success', processed: true })
      .mockResolvedValueOnce({
        status: 'conflict',
        conflict: { entityId: 'list1', entityType: 'listing' },
      });

    const result = await service.syncUpdates(dto);

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].entityId).toBe('list1');

    expect(syncConflictRepository.save).toHaveBeenCalled();
    expect(redisClient.set).toHaveBeenCalledWith(
      'sync:job:job-567',
      expect.any(String),
      'EX',
      86400,
    );
  });
});
