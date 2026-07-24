import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SyncService } from '../sync.service';
import {
  EntityPatchHandler,
  PatchResult,
} from '../handlers/entity-patch.handler';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { Neo4jService } from '../../../database/neo4j/neo4j.service';
import { SyncConflict } from '../entities/sync-conflict.entity';
import { SyncUpdatesBatchDto, SyncUpdateItemDto } from '../dto/sync-push.dto';
import { GetSnapshotQueryDto } from '../dto/sync-snapshot.dto';
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

import { ListingCategory } from '../../listings/entities/listing-category.entity';
import { EvenementsCategory } from '../../events/entities/evenements-category.entity';
import { PollOption } from '../../polls/entities/poll-option.entity';
import { EventParticipant } from '../../events/entities/event-participant.entity';
import { UsersInGroup } from '../../messaging/entities/users-in-group.entity';

import { Follow } from '../../social/entities/follow.entity';
import { Friendship } from '../../social/entities/friendship.entity';

describe('SyncService', () => {
  let service: SyncService;
  let redisClient: any;
  let entityPatchHandler: jest.Mocked<EntityPatchHandler>;
  let syncConflictRepository: any;

  const mockQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  });

  const mockRepository = () => ({
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder()),
    metadata: {
      findColumnWithPropertyName: jest.fn().mockReturnValue(null),
      primaryColumns: [],
      columns: [],
    },
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
        {
          provide: Neo4jService,
          useValue: { run: jest.fn().mockResolvedValue({ records: [] }) },
        },
        {
          provide: EntityPatchHandler,
          useValue: { handlePatch: jest.fn() },
        },
        {
          provide: getRepositoryToken(SyncConflict),
          useFactory: mockRepository,
        },
        { provide: getRepositoryToken(User), useFactory: mockRepository },
        { provide: getRepositoryToken(Incident), useFactory: mockRepository },
        { provide: getRepositoryToken(Listing), useFactory: mockRepository },
        { provide: getRepositoryToken(Evenement), useFactory: mockRepository },
        {
          provide: getRepositoryToken(ListingModerationAction),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(EventModerationAction),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(ListingReport),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(EventReport),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(ListingTransaction),
          useFactory: mockRepository,
        },
        { provide: getRepositoryToken(ChatGroup), useFactory: mockRepository },
        { provide: getRepositoryToken(Poll), useFactory: mockRepository },
        { provide: getRepositoryToken(Vote), useFactory: mockRepository },
        {
          provide: getRepositoryToken(ListingCategory),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(EvenementsCategory),
          useFactory: mockRepository,
        },
        { provide: getRepositoryToken(PollOption), useFactory: mockRepository },
        {
          provide: getRepositoryToken(EventParticipant),
          useFactory: mockRepository,
        },
        {
          provide: getRepositoryToken(UsersInGroup),
          useFactory: mockRepository,
        },
        { provide: getRepositoryToken(Follow), useFactory: mockRepository },
        { provide: getRepositoryToken(Friendship), useFactory: mockRepository },
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

  it('should process updates, store conflict as audit log, and return per-entity results', async () => {
    redisClient.get.mockResolvedValue(null); // Not cached

    const serverSnapshotTime = new Date('2025-06-01T10:00:00Z');

    const update1 = new SyncUpdateItemDto();
    update1.entity_type = 'user';
    update1.entity_id = 'user1';
    update1.base_updated_at = serverSnapshotTime.toISOString();

    const update2 = new SyncUpdateItemDto();
    update2.entity_type = 'listing';
    update2.entity_id = 'list1';
    update2.base_updated_at = serverSnapshotTime.toISOString();

    const dto = new SyncUpdatesBatchDto();
    dto.jobId = 'job-567';
    dto.updates = [update1, update2];

    entityPatchHandler.handlePatch
      .mockResolvedValueOnce({ status: 'success', processed: true })
      .mockResolvedValueOnce({
        status: 'conflict',
        conflict: {
          entityId: 'list1',
          entityType: 'listing',
          fieldName: 'title',
          clientData: { title: 'Local' },
          serverData: { title: 'Remote' },
          detectedAt: new Date(),
        },
      });

    const result = await service.syncUpdates(dto);

    expect(result.success).toBe(false);
    expect(result.has_conflicts).toBe(true);
    expect(result.applied_count).toBe(1);
    expect(result.conflict_count).toBe(1);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      entity_type: 'user',
      entity_id: 'user1',
      status: 'applied',
    });
    expect(result.results[1]).toEqual({
      entity_type: 'listing',
      entity_id: 'list1',
      status: 'conflict',
      conflict: {
        field_name: 'title',
        client_data: { title: 'Local' },
        server_data: { title: 'Remote' },
      },
    });

    expect(syncConflictRepository.save).toHaveBeenCalled();
    expect(redisClient.set).toHaveBeenCalledWith(
      'sync:job:job-567',
      expect.any(String),
      'EX',
      86400,
    );
  });

  it('should return success=true when all updates applied cleanly', async () => {
    redisClient.get.mockResolvedValue(null);

    const update1 = new SyncUpdateItemDto();
    update1.entity_type = 'user';
    update1.entity_id = 'user1';
    update1.base_updated_at = new Date().toISOString();

    const dto = new SyncUpdatesBatchDto();
    dto.jobId = 'job-clean';
    dto.updates = [update1];

    entityPatchHandler.handlePatch.mockResolvedValueOnce({
      status: 'success',
      processed: true,
    });

    const result = await service.syncUpdates(dto);

    expect(result.success).toBe(true);
    expect(result.has_conflicts).toBe(false);
    expect(result.applied_count).toBe(1);
    expect(result.conflict_count).toBe(0);
  });

  it('should set sync_at at the end of snapshot (after queries)', async () => {
    const query = new GetSnapshotQueryDto();
    query.since = new Date('2025-01-01T00:00:00Z');
    query.limit = 500;

    const result = await service.getSnapshot(query);

    expect(result.sync_at).toBeInstanceOf(Date);
    expect(result.sync_at.getTime()).toBeGreaterThan(
      new Date('2025-01-01').getTime(),
    );
  });
});
