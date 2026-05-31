import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, IsNull } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { User } from './entities/user.entity';
import { UserSwipe } from '../social/entities/user-swipe.entity';
import { UserBlock } from '../social/entities/user-block.entity';
import { DataProcessingService } from './data-processing.service';
import { Neo4jService } from '../../database/neo4j/neo4j.service';
import { PaginationDto, SwipeDto } from './dto/user-routes.dtos';
import { SwipeDirectionEnum, VisibilityEnum } from '../../common/enums';

@Injectable()
export class UserDiscoveryService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserSwipe)
    private readonly swipeRepository: Repository<UserSwipe>,
    @InjectRepository(UserBlock)
    private readonly blockRepository: Repository<UserBlock>,
    private readonly dataProcessingService: DataProcessingService,
    private readonly neo4jService: Neo4jService,
    @Inject('BullQueue_neo4j-sync')
    private readonly neo4jSyncQueue: { add: (name: string, data: any) => Promise<any> },
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  private async getBlockedUserIds(userId: string): Promise<string[]> {
    const blocks = await this.blockRepository.find({
      where: [
        { blockerId: userId },
        { blockedId: userId },
      ],
    });
    return Array.from(new Set(blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId))));
  }

  async search(
    requesterId: string,
    query: string,
    neighbourhood?: string,
    pagination: PaginationDto = new PaginationDto(),
  ): Promise<{ data: Partial<User>[]; meta: { total: number; offset: number; limit: number } }> {
    if (!query || query.trim() === '') {
      throw new BadRequestException('Le paramètre q est requis et ne doit pas être vide');
    }

    const blockedIds = await this.getBlockedUserIds(requesterId);
    const excludeIds = [...blockedIds, requesterId];

    const whereClause: any = {
      deletedAt: IsNull(),
      id: Not(In(excludeIds)),
    };

    if (neighbourhood) {
      whereClause.neighbourhoodId = neighbourhood;
    }

    // Build the query to fuzzy search on firstName or lastName using standard SQL ILike
    // TypeORM supports In and Not operators, but for fuzzy OR name search:
    const qb = this.userRepository.createQueryBuilder('user');
    qb.where('user.deleted_at IS NULL');
    qb.andWhere('user.id NOT IN (:...excludeIds)', { excludeIds });

    if (neighbourhood) {
      qb.andWhere('user.neighbourhood_id = :neighbourhood', { neighbourhood });
    }

    qb.andWhere(
      '(user.first_name ILIKE :query OR user.last_name ILIKE :query OR similarity(user.first_name, :rawQuery) > 0.3 OR similarity(user.last_name, :rawQuery) > 0.3)',
      { query: `%${query}%`, rawQuery: query },
    );

    const total = await qb.getCount();

    qb.skip(pagination.offset);
    qb.take(pagination.limit);
    const users = await qb.getMany();

    // Transform users to select only allowed columns
    const data = users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      visibility: u.visibility,
      bio: u.bio,
      neighbourhoodId: u.neighbourhoodId,
      profilePictureMongoId: u.profilePictureMongoId,
      bannerMongoId: u.bannerMongoId,
      role: u.role,
    }));

    return {
      data,
      meta: {
        total,
        offset: pagination.offset,
        limit: pagination.limit,
      },
    };
  }

  async getDiscoverFeed(
    userId: string,
    pagination: PaginationDto = new PaginationDto(),
  ): Promise<{ data: any[]; meta: { total: number; offset: number; limit: number } }> {
    const cacheKey = `discover:${userId}:offset:${pagination.offset}:limit:${pagination.limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const blockedIds = await this.getBlockedUserIds(userId);
    const swiped = await this.swipeRepository.find({
      where: { swiperId: userId },
    });
    const swipedIds = swiped.map((s) => s.swipedId);

    const excludeIds = Array.from(new Set([userId, ...blockedIds, ...swipedIds]));

    // Query candidate users from PostgreSQL first
    const candidates = await this.userRepository.find({
      where: {
        deletedAt: IsNull(),
        id: Not(In(excludeIds)),
        visibility: Not(VisibilityEnum.PRIVATE),
      },
    });

    // Filter out users opted out of discovery
    const discoveryCandidates: User[] = [];
    for (const c of candidates) {
      const isOpted = await this.dataProcessingService.isOptedOut(c.id, 'discovery');
      if (!isOpted) {
        discoveryCandidates.push(c);
      }
    }

    if (discoveryCandidates.length === 0) {
      return {
        data: [],
        meta: {
          total: 0,
          offset: pagination.offset,
          limit: pagination.limit,
        },
      };
    }

    const candidateIds = discoveryCandidates.map((c) => c.id);

    // Compute scores using Neo4j
    let scoredUserIds: { pgId: string; score: number }[] = [];
    try {
      const cypher = `
        MATCH (u:User { pg_id: $userId })
        MATCH (target:User)
        WHERE target.pg_id IN $candidateIds
        
        // Proximity (graph traversal using ADJACENT_TO up to 2 hops)
        OPTIONAL MATCH (u)-[:LIVES_IN]->(uNb:Neighbourhood)
        OPTIONAL MATCH (target)-[:LIVES_IN]->(tNb:Neighbourhood)
        OPTIONAL MATCH p = shortestPath((uNb)-[:ADJACENT_TO*0..2]-(tNb))
        WITH u, target, CASE WHEN p IS NOT NULL THEN length(p) ELSE -1 END AS hops
        WITH u, target, 
             CASE hops
               WHEN 0 THEN 3
               WHEN 1 THEN 2
               WHEN 2 THEN 1
               ELSE 0
             END AS geoScore
        
        // Social common connections
        OPTIONAL MATCH (u)-[:FOLLOWS|FRIENDS_WITH]-(c:User)-[:FOLLOWS|FRIENDS_WITH]-(target)
        WITH u, target, geoScore, count(c) as socialScore
        
        // Shared interests
        OPTIONAL MATCH (u)-[:INTERESTED_IN]->(cat:Category)<-[:INTERESTED_IN]-(target)
        WITH target, geoScore, socialScore, count(cat) * 2 as interestScore
        
        RETURN target.pg_id as pgId, (geoScore * 3 + socialScore + interestScore) as score
        ORDER BY score DESC
      `;

      const result = await this.neo4jService.run(cypher, {
        userId,
        candidateIds,
      });

      scoredUserIds = result.records.map((r) => ({
        pgId: r.get('pgId') as string,
        score: Number(r.get('score')),
      }));
    } catch (error) {
      // Graceful degradation: default score = 0
      console.warn('Neo4j discovery scoring failed, using default scores');
      scoredUserIds = candidateIds.map((id) => ({ pgId: id, score: 0 }));
    }

    // Map candidates to their scores
    const scoreMap = new Map(scoredUserIds.map((item) => [item.pgId, item.score]));
    const candidatesWithScores = discoveryCandidates.map((c) => ({
      user: c,
      score: scoreMap.get(c.id) ?? 0,
    }));

    // Sort by score descending
    candidatesWithScores.sort((a, b) => b.score - a.score);

    const total = candidatesWithScores.length;
    const paginated = candidatesWithScores.slice(
      pagination.offset,
      pagination.offset + pagination.limit,
    );

    const data = paginated.map((item) => ({
      id: item.user.id,
      firstName: item.user.firstName,
      lastName: item.user.lastName,
      visibility: item.user.visibility,
      bio: item.user.bio,
      neighbourhoodId: item.user.neighbourhoodId,
      profilePictureMongoId: item.user.profilePictureMongoId,
      bannerMongoId: item.user.bannerMongoId,
      score: item.score,
    }));

    const result = {
      data,
      meta: {
        total,
        offset: pagination.offset,
        limit: pagination.limit,
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 600);

    return result;
  }

  async swipe(userId: string, targetId: string, dto: SwipeDto): Promise<void> {
    if (userId === targetId) {
      throw new BadRequestException('Vous ne pouvez pas vous swiper vous-même');
    }

    const target = await this.userRepository.findOne({ where: { id: targetId, deletedAt: IsNull() } });
    if (!target) {
      throw new NotFoundException('Utilisateur cible introuvable');
    }

    const existing = await this.swipeRepository.findOne({
      where: { swiperId: userId, swipedId: targetId },
    });
    if (existing) {
      throw new ConflictException('Vous avez déjà swipé cet utilisateur');
    }

    const swipe = this.swipeRepository.create({
      swiperId: userId,
      swipedId: targetId,
      direction: dto.direction as SwipeDirectionEnum,
    });
    await this.swipeRepository.save(swipe);

    // Publish sync job to Neo4j queue
    await this.neo4jSyncQueue.add('user.swipe', {
      swiperId: userId,
      swipedId: targetId,
      direction: dto.direction,
    });
  }

  async getSwipeHistory(
    userId: string,
    pagination: PaginationDto = new PaginationDto(),
  ): Promise<{ data: any[]; meta: { total: number; offset: number; limit: number } }> {
    const [swipes, total] = await this.swipeRepository.findAndCount({
      where: { swiperId: userId },
      order: { swipedAt: 'DESC' },
      skip: pagination.offset,
      take: pagination.limit,
      relations: ['swiped'],
    });

    const data = swipes.map((s) => ({
      swiperId: s.swiperId,
      swipedId: s.swipedId,
      direction: s.direction,
      swipedAt: s.swipedAt,
      swipedUser: {
        id: s.swiped.id,
        firstName: s.swiped.firstName,
        lastName: s.swiped.lastName,
        profilePictureMongoId: s.swiped.profilePictureMongoId,
      },
    }));

    return {
      data,
      meta: {
        total,
        offset: pagination.offset,
        limit: pagination.limit,
      },
    };
  }
}
