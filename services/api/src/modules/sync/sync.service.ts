import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual } from 'typeorm';
import { REDIS_CLIENT } from '../../database/redis.module';
import Redis from 'ioredis';

import {
  GetSnapshotQueryDto,
  SnapshotResponseDto,
} from './dto/sync-snapshot.dto';
import { SyncUpdatesBatchDto, SyncUpdatesResponseDto } from './dto/sync-push.dto';

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

/**
 * Decodes a cursor value (base64-encoded ISO timestamp) back to a Date.
 * Returns null if the cursor is invalid or missing.
 */
function decodeCursor(cursor?: string): Date | null {
  if (!cursor) return null;
  try {
    const iso = Buffer.from(cursor, 'base64').toString('utf-8');
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * Encodes a Date as a base64 cursor string.
 */
function encodeCursor(date: Date): string {
  return Buffer.from(date.toISOString()).toString('base64');
}

@Injectable()
export class SyncService {
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
  ) {}

  async getSnapshot(dto: GetSnapshotQueryDto): Promise<SnapshotResponseDto> {
    const { since, limit = 500, cursor } = dto;
    const cursorDate = decodeCursor(cursor);
    // When resuming with a cursor, use the cursor timestamp as the effective
    // "since" to skip entities already returned in previous pages.
    const effectiveSince = cursorDate ?? since;
    const take = limit;
    let remaining = take;
    const response: SnapshotResponseDto = {
      sync_at: new Date(), // placeholder — will be set at the end
      has_more: false,
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
    };

    /**
     * Tracks the maximum timestamp seen across all fetched entities.
     * Used as the cursor value for the next page.
     */
    let maxTimestamp: Date | null = null;
    const trackMaxTimestamp = (entities: any[]) => {
      for (const entity of entities) {
        const ts =
          entity.updatedAt ||
          entity.createdAt ||
          entity.registeredAt ||
          entity.joinedAt ||
          entity.votedAt ||
          entity.followedAt ||
          entity.friendedAt;
        if (ts && (!maxTimestamp || ts > maxTimestamp)) {
          maxTimestamp = ts;
        }
      }
    };

    const fetchDelta = async (
      repo: Repository<any>,
      relations: string[] = [],
    ) => {
      if (remaining <= 0) return [];
      const qb = repo.createQueryBuilder('entity');

      // --- Resolve time columns ---
      const hasDeletedAt =
        repo.metadata.findColumnWithPropertyName('deletedAt');
      if (hasDeletedAt) {
        qb.withDeleted();
      }

      let timeColumn = '';
      const hasUpdatedAt = repo.metadata.findColumnWithPropertyName('updatedAt');
      const hasCreatedAt = repo.metadata.findColumnWithPropertyName('createdAt');

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

      // Build WHERE clause
      // When updatedAt is the primary time column, also OR with createdAt
      // because newly created entities have updatedAt = NULL (not @UpdateDateColumn).
      const orCreatedAt = timeColumn === 'updatedAt' && hasCreatedAt;
      const timeCondition = orCreatedAt
        ? `(entity.${timeColumn} > :since OR entity.createdAt > :since)`
        : `entity.${timeColumn} > :since`;

      if (timeColumn && hasDeletedAt) {
        qb.where(`${timeCondition} OR entity.deletedAt > :since`, {
          since: effectiveSince,
        });
      } else if (timeColumn) {
        qb.where(timeCondition, { since: effectiveSince });
      } else if (hasDeletedAt) {
        qb.where('entity.deletedAt > :since', { since: effectiveSince });
      }
      // If neither a time column nor deletedAt exists, return all rows
      // (these are typically small static tables refreshed in full).

      if (timeColumn) {
        qb.orderBy(`entity.${timeColumn}`, 'ASC');
      }

      relations.forEach((rel) => qb.leftJoinAndSelect(`entity.${rel}`, rel));
      qb.take(remaining);
      const results = await qb.getMany();
      trackMaxTimestamp(results);
      remaining -= results.length;
      return results;
    };

    // Sensitive fields stripped from snapshot reads (never sent to client)
    const SENSITIVE_FIELDS: Record<string, string[]> = {
      users_raw: [
        'passwordHash',
        'totpSecret',
        'stripeAccountId',
        'passwordChangedAt',
        'lastLoginAt',
        'isSuspended',
        'suspendedAt',
      ],
      listing_transactions: [
        'stripeSessionId',
        'stripePaymentIntent',
        'paymentFailedReason',
      ],
      event_participants: [
        'stripeSessionId',
        'stripePaymentIntent',
        'refundStripeId',
      ],
    };

    // Helper: strip undefined relations, sensitive fields, and convert to plain POJOs
    const clean = (arr: any[], key?: string) => {
      const stripped = SENSITIVE_FIELDS[key ?? ''] ?? [];
      return JSON.parse(
        JSON.stringify(arr, (k, v) => {
          if (stripped.includes(k)) return undefined;
          return v;
        }),
      );
    };

    response.incidents = clean(await fetchDelta(this.incidentRepository));
    response.listing_moderation_actions = clean(await fetchDelta(this.lmaRepository));
    response.event_moderation_actions = clean(await fetchDelta(this.emaRepository));
    response.listing_reports = clean(await fetchDelta(this.lReportRepository));
    response.event_reports = clean(await fetchDelta(this.eReportRepository));
    response.users_raw = clean(await fetchDelta(this.userRepository), 'users_raw');
    response.listings = clean(await fetchDelta(this.listingRepository));
    response.events = clean(await fetchDelta(this.eventRepository));
    response.chat_groups = clean(await fetchDelta(this.chatGroupRepository));
    response.votes = clean(await fetchDelta(this.voteRepository));
    response.polls = clean(await fetchDelta(this.pollRepository));
    response.listing_transactions = clean(await fetchDelta(this.ltRepository), 'listing_transactions');
    response.listing_categories = clean(await fetchDelta(this.listingCategoryRepository));
    response.event_categories = clean(await fetchDelta(this.eventCategoryRepository));
    response.poll_options = clean(await fetchDelta(this.pollOptionRepository));
    response.event_participants = clean(await fetchDelta(this.eventParticipantRepository), 'event_participants');
    response.users_in_group = clean(await fetchDelta(this.usersInGroupRepository));
    response.follows = clean(await fetchDelta(this.followRepository));
    response.friendships = clean(await fetchDelta(this.friendshipRepository));

    // Set sync_at at the END so it reflects the actual point-in-time
    // after all queries complete — prevents missed updates in the next delta.
    response.sync_at = new Date();

    if (remaining === 0) {
      response.has_more = true;
      // Encode the maximum entity timestamp seen as the cursor for the next page.
      // Falls back to sync_at if no entities were returned (edge case).
      response.cursor = encodeCursor(maxTimestamp ?? response.sync_at);
    }

    return response;
  }

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
        // Store conflict as audit log only — resolution happens client-side.
        // The client is expected to keep the entity dirty in SQLite, let the
        // user resolve locally, then re-push the resolved version.
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
        // Applied successfully — client should mark is_dirty=0, synced_at=now()
        appliedCount++;
        results.push({
          entity_type: update.entity_type,
          entity_id: update.entity_id,
          status: 'applied',
        });
      } else {
        // Skipped (entity not found, no valid fields, unknown entity type)
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
