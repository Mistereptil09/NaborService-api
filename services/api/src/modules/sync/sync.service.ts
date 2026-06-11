import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
} from 'typeorm';
import { REDIS_CLIENT } from '../../database/redis.module';
import { Neo4jService } from '../../database/neo4j/neo4j.service';
import Redis from 'ioredis';

import {
  GetSnapshotQueryDto,
  SnapshotResponseDto,
} from './dto/sync-snapshot.dto';
import {
  SyncUpdatesBatchDto,
  SyncUpdatesResponseDto,
} from './dto/sync-push.dto';

import { User } from '../users/entities/user.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Listing } from '../listings/entities/listing.entity';
import { Evenement } from '../events/entities/evenement.entity';
import { ListingModerationAction } from '../listings/entities/listing-moderation-action.entity';
import { EventModerationAction } from '../events/entities/event-moderation-action.entity';
import { ListingReport } from '../listings/entities/listing-report.entity';
import { EventReport } from '../events/entities/event-report.entity';
import { ListingTransaction } from '../listings/entities/listing-transaction.entity';
import { ChatGroup } from '../messaging/entities/chat-group.entity';
import { Poll } from '../polls/entities/poll.entity';
import { Vote } from '../polls/entities/vote.entity';
import { SyncConflict } from './entities/sync-conflict.entity';
import { EntityPatchHandler } from './handlers/entity-patch.handler';

import { ListingCategory } from '../listings/entities/listing-category.entity';
import { EvenementsCategory } from '../events/entities/evenements-category.entity';
import { PollOption } from '../polls/entities/poll-option.entity';
import { EventParticipant } from '../events/entities/event-participant.entity';
import { UsersInGroup } from '../messaging/entities/users-in-group.entity';

import { Follow } from '../social/entities/follow.entity';
import { Friendship } from '../social/entities/friendship.entity';

// ─── Composite Cursor ─────────────────────────────────────
//
// Format: base64(ISO_TIMESTAMP + "|" + entityType + "|" + entityId)
//
// Prevents the silent data loss that occurs with pure timestamp cursors
// when multiple entities share the exact same `updatedAt` (e.g. bulk
// INSERT inside a single transaction). The entity ID (UUID v7) ensures
// a strict total order even at identical timestamps.
//
// Example: 15 entities updated at "2026-06-09T15:30:00.000Z", limit=10
//   Page 1 → returns 10, cursor = encode(max_ts, max_type, max_id)
//   Page 2 → (timeCol = max_ts AND id > max_id) OR (timeCol > max_ts)
//          → returns remaining 5 (no data loss)

interface CursorPosition {
  date: Date;
  entityType: string;
  entityId: string;
}

function decodeCursor(cursor?: string): CursorPosition | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const parts = decoded.split('|');
    if (parts.length !== 3) return null;
    const date = new Date(parts[0]);
    if (isNaN(date.getTime())) return null;
    return { date, entityType: parts[1], entityId: parts[2] };
  } catch {
    return null;
  }
}

function encodeCursor(
  date: Date,
  entityType: string,
  entityId: string,
): string {
  const payload = `${date.toISOString()}|${entityType}|${entityId}`;
  return Buffer.from(payload).toString('base64');
}

// Maps repository entity class name to the cursor entityType label.
// These labels match the sync whitelist keys and the snapshot response
// property names, so the Java client can correlate them.
const REPO_TYPE_MAP = new Map<any, string>([
  [User, 'user'],
  [Incident, 'incident'],
  [Listing, 'listing'],
  [Evenement, 'event'],
  [ListingModerationAction, 'listing_moderation_actions'],
  [EventModerationAction, 'event_moderation_actions'],
  [ListingReport, 'listing_reports'],
  [EventReport, 'event_reports'],
  [ListingTransaction, 'listing_transactions'],
  [ChatGroup, 'chat_groups'],
  [Poll, 'polls'],
  [Vote, 'votes'],
  [ListingCategory, 'listing_categories'],
  [EvenementsCategory, 'event_categories'],
  [PollOption, 'poll_options'],
  [EventParticipant, 'event_participants'],
  [UsersInGroup, 'users_in_group'],
  [Follow, 'follows'],
  [Friendship, 'friendships'],
]);

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(Evenement)
    private readonly eventRepository: Repository<Evenement>,
    @InjectRepository(ListingModerationAction)
    private readonly lmaRepository: Repository<ListingModerationAction>,
    @InjectRepository(EventModerationAction)
    private readonly emaRepository: Repository<EventModerationAction>,
    @InjectRepository(ListingReport)
    private readonly lReportRepository: Repository<ListingReport>,
    @InjectRepository(EventReport)
    private readonly eReportRepository: Repository<EventReport>,
    @InjectRepository(ListingTransaction)
    private readonly ltRepository: Repository<ListingTransaction>,
    @InjectRepository(ChatGroup)
    private readonly chatGroupRepository: Repository<ChatGroup>,
    @InjectRepository(Poll) private readonly pollRepository: Repository<Poll>,
    @InjectRepository(Vote) private readonly voteRepository: Repository<Vote>,
    @InjectRepository(SyncConflict)
    private readonly syncConflictRepository: Repository<SyncConflict>,
    @InjectRepository(ListingCategory)
    private readonly listingCategoryRepository: Repository<ListingCategory>,
    @InjectRepository(EvenementsCategory)
    private readonly eventCategoryRepository: Repository<EvenementsCategory>,
    @InjectRepository(PollOption)
    private readonly pollOptionRepository: Repository<PollOption>,
    @InjectRepository(EventParticipant)
    private readonly eventParticipantRepository: Repository<EventParticipant>,
    @InjectRepository(UsersInGroup)
    private readonly usersInGroupRepository: Repository<UsersInGroup>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    @InjectRepository(Friendship)
    private readonly friendshipRepository: Repository<Friendship>,
    private readonly entityPatchHandler: EntityPatchHandler,
    private readonly neo4jService: Neo4jService,
  ) {}

  // ─── Snapshot (delta pull) ──────────────────────────────

  async getSnapshot(dto: GetSnapshotQueryDto): Promise<SnapshotResponseDto> {
    const { since, limit = 500, cursor } = dto;
    const cursorPos = decodeCursor(cursor);

    // Must have either `since` or `cursor` — at least one anchor point.
    if (!cursorPos && !since) {
      throw new BadRequestException(
        'Either `since` or `cursor` must be provided',
      );
    }

    // When a cursor is present, it drives the position. `since` is only
    // used on the very first page (no cursor). Sending both is harmless —
    // the cursor takes priority.
    const effectiveSince = cursorPos?.date ?? since!;
    const take = limit;
    let remaining = take;

    const response: SnapshotResponseDto = {
      sync_at: new Date(),
      has_more: false,
      cursor: '',
      incidents: [],
      listing_moderation_actions: [],
      event_moderation_actions: [],
      listing_reports: [],
      event_reports: [],
      users_raw: [],
      listings: [],
      events: [],
      chat_groups: [],
      votes: [],
      polls: [],
      listing_transactions: [],
      listing_categories: [],
      event_categories: [],
      poll_options: [],
      event_participants: [],
      users_in_group: [],
      follows: [],
      friendships: [],
      neighbourhoods: {},
    };

    // Track the max (timestamp, type, id) across all fetched entities.
    // Used to build the composite cursor for the next page.
    let maxTs: Date | null = null;
    let maxType = '';
    let maxId = '';

    const trackMax = (entities: any[], typeLabel: string, pkProp?: string) => {
      for (const entity of entities) {
        const ts =
          entity.updatedAt ||
          entity.createdAt ||
          entity.registeredAt ||
          entity.joinedAt ||
          entity.votedAt ||
          entity.followedAt ||
          entity.friendedAt;
        if (ts) {
          // Use the repo's primary key column value. For entities with a
          // single `id` column that's `entity.id`. For composite-PK tables
          // (votes → userId, follows → followerId, etc.) we use the first
          // PK column's property value to keep the cursor comparable.
          const eid = pkProp
            ? (entity[pkProp] ?? '')
            : (entity.id ?? entity._id?.toString() ?? '');
          if (
            !maxTs ||
            ts > maxTs ||
            (ts.getTime() === maxTs.getTime() && eid > maxId)
          ) {
            maxTs = ts;
            maxType = typeLabel;
            maxId = eid;
          }
        }
      }
    };

    /**
     * Generic delta fetcher. When a composite cursor is present and
     * the current repo matches the cursor's entity type, the WHERE
     * clause uses a composite condition to avoid the silent data loss
     * that occurs when multiple entities share the same timestamp.
     *
     * Composite WHERE (cursor's own type):
     *   (timeCol = cursorDate AND id > cursorId) OR (timeCol > cursorDate)
     *
     * Simple WHERE (all other entity types):
     *   timeCol > effectiveSince
     */
    const fetchDelta = async (
      repo: Repository<any>,
      relations: string[] = [],
    ) => {
      if (remaining <= 0) return [];

      const qb = repo.createQueryBuilder('entity');

      const hasDeletedAt =
        repo.metadata.findColumnWithPropertyName('deletedAt');
      if (hasDeletedAt) {
        qb.withDeleted();
      }

      let timeColumn = '';
      const hasUpdatedAt =
        repo.metadata.findColumnWithPropertyName('updatedAt');
      const hasCreatedAt =
        repo.metadata.findColumnWithPropertyName('createdAt');

      if (hasUpdatedAt) {
        timeColumn = 'updatedAt';
      } else if (hasCreatedAt) {
        timeColumn = 'createdAt';
      } else if (repo.metadata.findColumnWithPropertyName('registeredAt')) {
        timeColumn = 'registeredAt';
      } else if (repo.metadata.findColumnWithPropertyName('joinedAt')) {
        timeColumn = 'joinedAt';
      } else if (repo.metadata.findColumnWithPropertyName('votedAt')) {
        timeColumn = 'votedAt';
      } else if (repo.metadata.findColumnWithPropertyName('followedAt')) {
        timeColumn = 'followedAt';
      } else if (repo.metadata.findColumnWithPropertyName('friendedAt')) {
        timeColumn = 'friendedAt';
      }

      const repoType = REPO_TYPE_MAP.get(repo.target) ?? '';
      const isCursorRepo =
        cursorPos !== null && repoType === cursorPos.entityType;
      // Resolve the primary key column name for cursor WHERE clauses.
      // Most entities have a single `id` column; composite-PK tables
      // (votes, follows, event_participants…) use their first PK column.
      const pkColumn = repo.metadata.primaryColumns[0]?.databaseName || 'id';

      // Build WHERE clause
      if (timeColumn) {
        if (isCursorRepo) {
          // Composite cursor: (timeCol = cursorDate AND <pkCol> > cursorId)
          //                    OR (timeCol > cursorDate)
          qb.where(
            `(entity.${timeColumn} = :cursorDate AND entity.${pkColumn} > :cursorId) OR (entity.${timeColumn} > :cursorDate)`,
            {
              cursorDate: cursorPos.date,
              cursorId: cursorPos.entityId,
            },
          );
        } else if (cursorPos) {
          // Other repos on a cursor page: use >= to avoid missing entities
          // at the exact cursor boundary timestamp
          qb.where(`entity.${timeColumn} >= :since`, {
            since: effectiveSince,
          });
        } else {
          // First page (no cursor): use > for strict delta
          const orCreatedAt = timeColumn === 'updatedAt' && hasCreatedAt;
          const timeCondition = orCreatedAt
            ? `(entity.${timeColumn} > :since OR entity.createdAt > :since)`
            : `entity.${timeColumn} > :since`;
          qb.where(timeCondition, { since: effectiveSince });
        }

        // Soft-delete catch-up
        if (hasDeletedAt) {
          qb.andWhere(
            `(entity.deletedAt IS NULL OR entity.deletedAt > :since)`,
            {
              since: effectiveSince,
            },
          );
        }
      } else if (hasDeletedAt) {
        qb.where('entity.deletedAt > :since', { since: effectiveSince });
      }

      if (timeColumn) {
        qb.orderBy(`entity.${timeColumn}`, 'ASC');
      }
      // Secondary sort by primary key(s) for deterministic order across
      // entities sharing the same timestamp. Some tables use composite
      // keys (votes → user_id + option_id, follows → follower_id + followed_id)
      // — we sort by every PK column to ensure a strict total order.
      for (const pk of repo.metadata.primaryColumns) {
        qb.addOrderBy(`entity.${pk.databaseName}`, 'ASC');
      }

      relations.forEach((rel) => qb.leftJoinAndSelect(`entity.${rel}`, rel));
      qb.take(remaining);
      const results = await qb.getMany();

      trackMax(
        results,
        repoType,
        repo.metadata.primaryColumns[0]?.propertyName,
      );
      remaining -= results.length;
      return results;
    };

    // Map snapshot response keys → EntityPatchHandler entity type keys
    const snapshotKeyMap: Record<string, string> = {
      users_raw: 'user',
      listing_transactions: 'listing_transactions',
      event_participants: 'event_participants',
    };

    // Helper: strip sensitive fields and convert to plain POJOs
    const clean = (arr: any[], snapshotKey?: string) => {
      const entityKey = snapshotKey
        ? (snapshotKeyMap[snapshotKey] ?? snapshotKey)
        : '';
      const stripped = EntityPatchHandler.SENSITIVE_FIELDS[entityKey] ?? [];
      return JSON.parse(
        JSON.stringify(arr, (k, v) => {
          if (stripped.includes(k)) return undefined;
          return v;
        }),
      );
    };

    // ── Fetch in order ────────────────────────────────────
    response.incidents = clean(await fetchDelta(this.incidentRepository));
    response.listing_moderation_actions = clean(
      await fetchDelta(this.lmaRepository),
    );
    response.event_moderation_actions = clean(
      await fetchDelta(this.emaRepository),
    );
    response.listing_reports = clean(await fetchDelta(this.lReportRepository));
    response.event_reports = clean(await fetchDelta(this.eReportRepository));
    response.users_raw = clean(
      await fetchDelta(this.userRepository),
      'users_raw',
    );
    response.listings = clean(await fetchDelta(this.listingRepository));
    response.events = clean(await fetchDelta(this.eventRepository));
    response.chat_groups = clean(await fetchDelta(this.chatGroupRepository));
    response.votes = clean(await fetchDelta(this.voteRepository));
    response.polls = clean(await fetchDelta(this.pollRepository));
    response.listing_transactions = clean(
      await fetchDelta(this.ltRepository),
      'listing_transactions',
    );
    response.listing_categories = clean(
      await fetchDelta(this.listingCategoryRepository),
    );
    response.event_categories = clean(
      await fetchDelta(this.eventCategoryRepository),
    );
    response.poll_options = clean(await fetchDelta(this.pollOptionRepository));
    response.event_participants = clean(
      await fetchDelta(this.eventParticipantRepository),
      'event_participants',
    );
    response.users_in_group = clean(
      await fetchDelta(this.usersInGroupRepository),
    );
    response.follows = clean(await fetchDelta(this.followRepository));
    response.friendships = clean(await fetchDelta(this.friendshipRepository));

    // Neighbourhood id → name map for Java client UX
    try {
      const nbResult = await this.neo4jService.run(
        'MATCH (n:Neighbourhood) RETURN n.pg_id AS id, n.name AS name',
      );
      const nbMap: Record<string, string> = {};
      for (const record of nbResult.records) {
        nbMap[record.get('id')] = record.get('name');
      }
      response.neighbourhoods = nbMap;
    } catch {
      response.neighbourhoods = {};
    }

    // Set sync_at at the END so it reflects the actual point-in-time
    // after all queries complete — prevents missed updates in the next delta.
    response.sync_at = new Date();

    // Always return a composite cursor encoding the position of the last
    // entity included in this page (or sync_at if the delta is empty).
    // Consistent cursor presence lets the client unconditionally store it
    // as the resume point without branching on has_more.
    response.cursor = encodeCursor(
      maxTs ?? response.sync_at,
      maxType || '',
      maxId || '00000000-0000-0000-0000-000000000000',
    );

    if (remaining === 0) {
      response.has_more = true;
    }

    return response;
  }

  // ─── Push (batch updates) ───────────────────────────────

  async syncUpdates(dto: SyncUpdatesBatchDto): Promise<SyncUpdatesResponseDto> {
    const cachedResponse = await this.checkIdempotence(dto.jobId);
    if (cachedResponse) {
      return cachedResponse;
    }

    const results: SyncUpdatesResponseDto['results'] = [];
    let appliedCount = 0;
    let conflictCount = 0;

    for (const update of dto.updates) {
      const result = await this.entityPatchHandler.handlePatch(update);

      if (result.status === 'conflict') {
        const conflictRecord = this.syncConflictRepository.create(
          result.conflict,
        );
        await this.syncConflictRepository.save(conflictRecord);
        conflictCount++;

        results.push({
          entity_type: update.entity_type,
          entity_id: update.entity_id,
          status: 'conflict',
          conflict: {
            field_name: result.conflict.fieldName ?? null,
            client_data: result.conflict.clientData,
            server_data: result.conflict.serverData,
          },
        });
      } else if (result.status === 'success' && result.processed) {
        appliedCount++;
        results.push({
          entity_type: update.entity_type,
          entity_id: update.entity_id,
          status: 'applied',
          server_entity_id: result.serverEntityId,
        });
      } else if (result.status === 'skipped') {
        this.logger.warn(
          `[sync] SKIPPED ${update.entity_type}/${update.entity_id}: ${result.reason}`,
        );
        results.push({
          entity_type: update.entity_type,
          entity_id: update.entity_id,
          status: 'skipped',
          reason: result.reason,
        });
      } else {
        results.push({
          entity_type: update.entity_type,
          entity_id: update.entity_id,
          status: 'skipped',
        });
      }
    }

    const finalResponse: SyncUpdatesResponseDto = {
      success: conflictCount === 0,
      has_conflicts: conflictCount > 0,
      applied_count: appliedCount,
      conflict_count: conflictCount,
      results,
    };
    await this.markJobProcessed(dto.jobId, finalResponse);
    return finalResponse;
  }

  private async checkIdempotence(jobId: string): Promise<any | null> {
    const key = `sync:job:${jobId}`;
    const exists = await this.redisClient.get(key);
    if (exists) {
      try {
        return JSON.parse(exists);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  private async markJobProcessed(jobId: string, response: any): Promise<void> {
    const key = `sync:job:${jobId}`;
    await this.redisClient.set(key, JSON.stringify(response), 'EX', 86400);
  }
}
