import { Injectable, Inject, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual } from 'typeorm';
import { REDIS_CLIENT } from '../../database/redis.module';
import Redis from 'ioredis';
import { Neo4jService } from '../../database/neo4j';

import { GetSnapshotQueryDto, SnapshotResponseDto } from './dto/sync-snapshot.dto';
import { SyncUpdatesBatchDto } from './dto/sync-push.dto';

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

@Injectable()
export class SyncService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    private readonly neo4jService: Neo4jService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Incident) private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(Listing) private readonly listingRepository: Repository<Listing>,
    @InjectRepository(Evenement) private readonly eventRepository: Repository<Evenement>,
    @InjectRepository(ListingModerationAction) private readonly lmaRepository: Repository<ListingModerationAction>,
    @InjectRepository(EventModerationAction) private readonly emaRepository: Repository<EventModerationAction>,
    @InjectRepository(ListingReport) private readonly lReportRepository: Repository<ListingReport>,
    @InjectRepository(EventReport) private readonly eReportRepository: Repository<EventReport>,
    @InjectRepository(ListingTransaction) private readonly ltRepository: Repository<ListingTransaction>,
    @InjectRepository(ChatGroup) private readonly chatGroupRepository: Repository<ChatGroup>,
    @InjectRepository(Poll) private readonly pollRepository: Repository<Poll>,
    @InjectRepository(Vote) private readonly voteRepository: Repository<Vote>,
  ) {}

  async getSnapshot(dto: GetSnapshotQueryDto): Promise<SnapshotResponseDto> {
    const { since, limit = 500, cursor } = dto;
    const syncAt = new Date(); 
    const take = limit;
    let remaining = take;
    const response: SnapshotResponseDto = {
      sync_at: syncAt,
      has_more: false,
      incidents: [],
      listing_moderation_actions: [],
      event_moderation_actions: [],
      listing_reports: [],
      event_reports: [],
      users_raw: [],
      neighbourhoods: [],
      listings: [],
      events: [],
      chat_groups: [],
      votes: [],
      polls: [],
      listing_transactions: [],
    };

    const fetchDelta = async (repo: Repository<any>, relations: string[] = []) => {
      if (remaining <= 0) return [];
      const qb = repo.createQueryBuilder('entity').withDeleted();
      if (repo.metadata.findColumnWithPropertyName('updatedAt') && repo.metadata.findColumnWithPropertyName('deletedAt')) {
        qb.where('entity.updatedAt > :since OR entity.deletedAt > :since', { since });
      } else if (repo.metadata.findColumnWithPropertyName('updatedAt')) {
        qb.where('entity.updatedAt > :since', { since });
      } else if (repo.metadata.findColumnWithPropertyName('createdAt')) {
        qb.where('entity.createdAt > :since', { since }); 
      }
      relations.forEach(rel => qb.leftJoinAndSelect(`entity.${rel}`, rel));
      qb.orderBy(repo.metadata.findColumnWithPropertyName('updatedAt') ? 'entity.updatedAt' : 'entity.createdAt', 'ASC');
      qb.take(remaining);
      const results = await qb.getMany();
      remaining -= results.length;
      return results;
    };

    response.incidents = await fetchDelta(this.incidentRepository);
    response.listing_moderation_actions = await fetchDelta(this.lmaRepository);
    response.event_moderation_actions = await fetchDelta(this.emaRepository);
    response.listing_reports = await fetchDelta(this.lReportRepository);
    response.event_reports = await fetchDelta(this.eReportRepository);
    response.users_raw = await fetchDelta(this.userRepository);
    response.listings = await fetchDelta(this.listingRepository);
    response.events = await fetchDelta(this.eventRepository);
    response.chat_groups = await fetchDelta(this.chatGroupRepository);
    response.votes = await fetchDelta(this.voteRepository);
    response.polls = await fetchDelta(this.pollRepository);
    response.listing_transactions = await fetchDelta(this.ltRepository);

    if (remaining > 0) {
      const cypher = `
        MATCH (n:Neighbourhood)
        WHERE n.updated_at > datetime($since)
        RETURN n
        ORDER BY n.updated_at ASC
        LIMIT $limit
      `;
      const result = await this.neo4jService.run(cypher, { since: since.toISOString(), limit: remaining });
      const neo4jNodes = result.records.map(r => {
        const props = (r.get('n') as any).properties;
        return {
          pg_id: props.pg_id,
          name: props.name,
          city: props.city,
          zip_code: props.zip_code,
          country: props.country,
          area_m2: props.area_m2?.toNumber?.() || props.area_m2,
          created_at: props.created_at?.toString?.(),
          updated_at: props.updated_at?.toString?.(),
        };
      });
      response.neighbourhoods = neo4jNodes;
      remaining -= neo4jNodes.length;
    }

    if (remaining === 0) {
      response.has_more = true;
      response.cursor = Buffer.from(syncAt.toISOString()).toString('base64');
    }

    return response;
  }

  async syncUpdates(dto: SyncUpdatesBatchDto): Promise<any> {
    const isProcessed = await this.checkIdempotence(dto.jobId);
    if (isProcessed) {
      return { success: true, message: 'Job already processed' };
    }

    const conflicts: any[] = [];
    let updatedCount = 0;

    for (const update of dto.updates) {
      const { entity_type, entity_id, changes } = update;
      
      const sensitiveFields = ['passwordHash', 'password_hash', 'totpSecret', 'totp_secret', 'stripeAccountId', 'stripe_account_id'];
      for (const field of sensitiveFields) {
        if (field in changes) delete changes[field];
      }

      if (Object.keys(changes).length === 0) continue;

      let repo: Repository<any> | null = null;
      if (entity_type === 'user') repo = this.userRepository;
      else if (entity_type === 'listing') repo = this.listingRepository;
      else if (entity_type === 'event') repo = this.eventRepository;
      else if (entity_type === 'incident') repo = this.incidentRepository;

      if (repo) {
        const existing = await repo.findOne({ where: { id: entity_id } });
        if (existing) {
          await repo.update(entity_id, changes);
          updatedCount++;
        }
      } else if (entity_type === 'neighbourhood') {
        const setClauses: string[] = [];
        const params: any = { pgId: entity_id };
        for (const [k, v] of Object.entries(changes)) {
          setClauses.push(`n.${k} = $${k}`);
          params[k] = v;
        }
        if (setClauses.length > 0) {
          const cypher = `MATCH (n:Neighbourhood { pg_id: $pgId }) SET ${setClauses.join(', ')}, n.updated_at = datetime()`;
          await this.neo4jService.run(cypher, params);
          updatedCount++;
        }
      }
    }

    await this.markJobProcessed(dto.jobId);
    return { success: true, conflicts, processedCount: updatedCount };
  }

  private async checkIdempotence(jobId: string): Promise<boolean> {
    const key = `sync:job:${jobId}`;
    const exists = await this.redisClient.get(key);
    return exists === '1';
  }

  private async markJobProcessed(jobId: string): Promise<void> {
    const key = `sync:job:${jobId}`;
    await this.redisClient.set(key, '1', 'EX', 86400);
  }
}
