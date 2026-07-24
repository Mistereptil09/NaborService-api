import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Neo4jService } from '../../database/neo4j/neo4j.service';
import { User } from '../users/entities/user.entity';
import { Listing } from '../listings/entities/listing.entity';
import { Evenement } from '../events/entities/evenement.entity';
import { Follow } from '../social/entities/follow.entity';
import { Friendship } from '../social/entities/friendship.entity';
import { UserBlock } from '../social/entities/user-block.entity';

@Injectable()
export class GeoReconciliationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GeoReconciliationService.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(Evenement)
    private readonly eventRepository: Repository<Evenement>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    @InjectRepository(Friendship)
    private readonly friendshipRepository: Repository<Friendship>,
    @InjectRepository(UserBlock)
    private readonly userBlockRepository: Repository<UserBlock>,
    private readonly neo4jService: Neo4jService,
  ) {}

  onApplicationBootstrap() {
    setTimeout(() => this.runFullStartupScan(), 10_000);
  }

  private async runFullStartupScan() {
    this.logger.log('Running startup full reconciliation...');
    try {
      await this.reconcileRecentEntities(Number.MAX_SAFE_INTEGER);
      await this.reconcileFollows(null);
      await this.reconcileBlocks(null);
      await this.reconcileFriendships(null);
      this.logger.log('Startup reconciliation complete.');
    } catch (error) {
      const msg = (error as Error).message;
      if (
        msg.includes('Driver not Connected') ||
        msg.includes('Unable to acquire connection')
      ) {
        this.logger.warn(`Startup reconciliation skipped (Neo4j unavailable)`);
      } else {
        this.logger.error(`Startup reconciliation failed: ${msg}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyReconciliation() {
    this.logger.log('Starting hourly reconciliation...');
    try {
      await this.reconcileRecentEntities(1.5);
      await this.reconcileSocialGraph(1.5);
      this.logger.log('Hourly reconciliation complete.');
    } catch (error) {
      const msg = (error as Error).message;
      if (
        msg.includes('Driver not Connected') ||
        msg.includes('Unable to acquire connection')
      ) {
        this.logger.warn(`Hourly reconciliation skipped (Neo4j unavailable)`);
      } else {
        this.logger.error(`Hourly reconciliation failed: ${msg}`);
      }
    }
  }

  async reconcileRecentEntities(hours: number): Promise<void> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [users, listings, events] = await Promise.all([
      hours >= Number.MAX_SAFE_INTEGER / 2
        ? this.userRepository.find({ select: ['id', 'neighbourhoodId'] })
        : this.userRepository
            .createQueryBuilder('u')
            .select(['u.id', 'u.neighbourhoodId'])
            .where('u.updatedAt >= :cutoff OR u.createdAt >= :cutoff', {
              cutoff,
            })
            .getMany(),
      hours >= Number.MAX_SAFE_INTEGER / 2
        ? this.listingRepository.find({ select: ['id', 'neighbourhoodId'] })
        : this.listingRepository
            .createQueryBuilder('l')
            .select(['l.id', 'l.neighbourhoodId'])
            .where('l.updatedAt >= :cutoff OR l.createdAt >= :cutoff', {
              cutoff,
            })
            .getMany(),
      hours >= Number.MAX_SAFE_INTEGER / 2
        ? this.eventRepository.find({ select: ['id', 'neighbourhoodId'] })
        : this.eventRepository
            .createQueryBuilder('e')
            .select(['e.id', 'e.neighbourhoodId'])
            .where('e.updatedAt >= :cutoff OR e.createdAt >= :cutoff', {
              cutoff,
            })
            .getMany(),
    ]);

    let fixed = 0;
    for (const user of users) {
      if (
        await this.reconcileEntity(
          'User',
          user.id,
          user.neighbourhoodId,
          'LIVES_IN',
        )
      )
        fixed++;
    }
    for (const listing of listings) {
      if (
        await this.reconcileEntity(
          'Listing',
          listing.id,
          listing.neighbourhoodId,
          'POSTED_IN',
        )
      )
        fixed++;
    }
    for (const event of events) {
      if (
        await this.reconcileEntity(
          'Event',
          event.id,
          event.neighbourhoodId,
          'HOSTED_IN',
        )
      )
        fixed++;
    }

    this.logger.log(
      `Geo: checked ${users.length + listings.length + events.length} entities, fixed ${fixed}.`,
    );
  }

  async reconcileSocialGraph(hours: number | null = 1.5): Promise<void> {
    let fixed = 0;
    fixed += await this.reconcileFollows(hours);
    fixed += await this.reconcileBlocks(hours);
    fixed += await this.reconcileFriendships(hours);
    if (fixed > 0) {
      this.logger.log(`Social graph: fixed ${fixed} discrepancies.`);
    }
  }

  private async reconcileFollows(hours: number | null): Promise<number> {
    let fixed = 0;

    const follows =
      hours != null
        ? await this.followRepository
            .createQueryBuilder('f')
            .select(['f.followerId', 'f.followedId'])
            .where('f.followedAt >= :cutoff', {
              cutoff: new Date(Date.now() - hours * 60 * 60 * 1000),
            })
            .getMany()
        : await this.followRepository.find({
            select: ['followerId', 'followedId'],
          });

    const neoResult = await this.neo4jService.run(
      `MATCH (u1:User)-[r:FOLLOWS]->(u2:User)
       RETURN u1.pg_id AS followerId, u2.pg_id AS followedId`,
    );

    const pgSet = new Set(
      follows.map((f) => `${f.followerId}->${f.followedId}`),
    );
    const neoSet = new Set(
      neoResult.records.map(
        (r) => `${r.get('followerId')}->${r.get('followedId')}`,
      ),
    );

    for (const f of follows) {
      const key = `${f.followerId}->${f.followedId}`;
      if (!neoSet.has(key)) {
        try {
          await this.neo4jService.run(
            `MATCH (u1:User {pg_id: $followerId})
             MATCH (u2:User {pg_id: $followedId})
             MERGE (u1)-[r:FOLLOWS]->(u2)
             ON CREATE SET r.since = datetime()`,
            { followerId: f.followerId, followedId: f.followedId },
          );
          fixed++;
        } catch {
          /* node not in Neo4j yet */
        }
      }
    }

    for (const key of neoSet) {
      if (!pgSet.has(key)) {
        const [followerId, followedId] = key.split('->');
        try {
          await this.neo4jService.run(
            `MATCH (u1:User {pg_id: $followerId})-[r:FOLLOWS]->(u2:User {pg_id: $followedId})
             DELETE r`,
            { followerId, followedId },
          );
          fixed++;
        } catch {
          /* already gone */
        }
      }
    }

    return fixed;
  }

  private async reconcileBlocks(hours: number | null): Promise<number> {
    let fixed = 0;

    const blocks =
      hours != null
        ? await this.userBlockRepository
            .createQueryBuilder('b')
            .select(['b.blockerId', 'b.blockedId'])
            .where('b.blockedAt >= :cutoff', {
              cutoff: new Date(Date.now() - hours * 60 * 60 * 1000),
            })
            .getMany()
        : await this.userBlockRepository.find({
            select: ['blockerId', 'blockedId'],
          });

    const neoResult = await this.neo4jService.run(
      `MATCH (u1:User)-[r:BLOCKS]->(u2:User)
       RETURN u1.pg_id AS blockerId, u2.pg_id AS blockedId`,
    );

    const pgSet = new Set(blocks.map((b) => `${b.blockerId}->${b.blockedId}`));
    const neoSet = new Set(
      neoResult.records.map(
        (r) => `${r.get('blockerId')}->${r.get('blockedId')}`,
      ),
    );

    for (const b of blocks) {
      const key = `${b.blockerId}->${b.blockedId}`;
      if (!neoSet.has(key)) {
        try {
          await this.neo4jService.run(
            `MATCH (u1:User {pg_id: $blockerId})
             MATCH (u2:User {pg_id: $blockedId})
             MERGE (u1)-[:BLOCKS]->(u2)`,
            { blockerId: b.blockerId, blockedId: b.blockedId },
          );
          fixed++;
        } catch {
          /* */
        }
      }
    }

    for (const key of neoSet) {
      if (!pgSet.has(key)) {
        const [blockerId, blockedId] = key.split('->');
        try {
          await this.neo4jService.run(
            `MATCH (u1:User {pg_id: $blockerId})-[r:BLOCKS]->(u2:User {pg_id: $blockedId})
             DELETE r`,
            { blockerId, blockedId },
          );
          fixed++;
        } catch {
          /* */
        }
      }
    }

    return fixed;
  }

  private async reconcileFriendships(hours: number | null): Promise<number> {
    let fixed = 0;

    const friendships =
      hours != null
        ? await this.friendshipRepository
            .createQueryBuilder('f')
            .select(['f.user1Id', 'f.user2Id'])
            .where('f.unfriendedAt IS NULL')
            .andWhere('f.friendedAt >= :cutoff', {
              cutoff: new Date(Date.now() - hours * 60 * 60 * 1000),
            })
            .getMany()
        : await this.friendshipRepository.find({
            select: ['user1Id', 'user2Id'],
            where: { unfriendedAt: undefined },
          });

    const neoResult = await this.neo4jService.run(
      `MATCH (u1:User)-[r:FRIENDS_WITH]-(u2:User)
       RETURN u1.pg_id AS user1Id, u2.pg_id AS user2Id`,
    );

    const normKey = (a: string, b: string) =>
      a < b ? `${a}<->${b}` : `${b}<->${a}`;

    const pgSet = new Set(
      friendships.map((f) => normKey(f.user1Id, f.user2Id)),
    );
    const neoSet = new Set(
      neoResult.records.map((r) => normKey(r.get('user1Id'), r.get('user2Id'))),
    );

    for (const f of friendships) {
      const key = normKey(f.user1Id, f.user2Id);
      if (!neoSet.has(key)) {
        try {
          await this.neo4jService.run(
            `MATCH (u1:User {pg_id: $user1Id})
             MATCH (u2:User {pg_id: $user2Id})
             MERGE (u1)-[r:FRIENDS_WITH]-(u2)
             ON CREATE SET r.since = datetime()`,
            { user1Id: f.user1Id, user2Id: f.user2Id },
          );
          fixed++;
        } catch {
          /* */
        }
      }
    }

    for (const key of neoSet) {
      if (!pgSet.has(key)) {
        const [user1Id, user2Id] = key.split('<->');
        try {
          await this.neo4jService.run(
            `MATCH (u1:User {pg_id: $user1Id})-[r:FRIENDS_WITH]-(u2:User {pg_id: $user2Id})
             DELETE r`,
            { user1Id, user2Id },
          );
          fixed++;
        } catch {
          /* */
        }
      }
    }

    return fixed;
  }

  private async reconcileEntity(
    nodeLabel: string,
    entityPgId: string,
    pgNeighbourhoodId: string | null,
    relationshipType: string,
  ): Promise<boolean> {
    const result = await this.neo4jService.run(
      `MATCH (e:${nodeLabel} {pg_id: $entityPgId})
       OPTIONAL MATCH (e)-[r:${relationshipType}]->(n:Neighbourhood)
       RETURN n.pg_id AS neo4jNbId`,
      { entityPgId },
    );

    if (result.records.length === 0) return false;

    const neo4jNbId = result.records[0].get('neo4jNbId');

    if (pgNeighbourhoodId && neo4jNbId !== pgNeighbourhoodId) {
      this.logger.warn(
        `Mismatch: ${nodeLabel} ${entityPgId}: PG=${pgNeighbourhoodId}, Neo4j=${neo4jNbId}`,
      );

      const nbResult = await this.neo4jService.run(
        `MATCH (n:Neighbourhood {pg_id: $pgNeighbourhoodId}) RETURN n`,
        { pgNeighbourhoodId },
      );

      if (nbResult.records.length > 0) {
        await this.neo4jService.run(
          `MATCH (e:${nodeLabel} {pg_id: $entityPgId})
           MATCH (n:Neighbourhood {pg_id: $pgNeighbourhoodId})
           OPTIONAL MATCH (e)-[oldR:${relationshipType}]->(oldN:Neighbourhood)
           DELETE oldR
           MERGE (e)-[newR:${relationshipType}]->(n)
           SET newR.updated_at = datetime()`,
          { entityPgId, pgNeighbourhoodId },
        );
      } else {
        this.logger.warn(
          `Orphan: Neighbourhood ${pgNeighbourhoodId} missing in Neo4j. Clearing PG.`,
        );
        await this.updatePostgresNeighbourhood(nodeLabel, entityPgId, null);
      }
      return true;
    }

    if (!pgNeighbourhoodId && neo4jNbId) {
      this.logger.warn(
        `Stale: ${nodeLabel} ${entityPgId}: PG=null, Neo4j=${neo4jNbId}`,
      );
      await this.neo4jService.run(
        `MATCH (e:${nodeLabel} {pg_id: $entityPgId})-[r:${relationshipType}]->(n:Neighbourhood)
         DELETE r`,
        { entityPgId },
      );
      return true;
    }

    return false;
  }

  private async updatePostgresNeighbourhood(
    nodeLabel: string,
    entityPgId: string,
    neighbourhoodId: string | null,
  ): Promise<void> {
    switch (nodeLabel) {
      case 'User':
        await this.userRepository.update(entityPgId, { neighbourhoodId });
        break;
      case 'Listing':
        await this.listingRepository.update(entityPgId, { neighbourhoodId });
        break;
      case 'Event':
        await this.eventRepository.update(entityPgId, { neighbourhoodId });
        break;
    }
  }
}
