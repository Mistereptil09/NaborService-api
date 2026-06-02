import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Neo4jService } from '../../database/neo4j/neo4j.service';
import { User } from '../users/entities/user.entity';
import { Listing } from '../listings/entities/listing.entity';
import { Evenement } from '../events/entities/evenement.entity';

@Injectable()
export class GeoReconciliationService {
  private readonly logger = new Logger(GeoReconciliationService.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(Evenement)
    private readonly eventRepository: Repository<Evenement>,
    private readonly neo4jService: Neo4jService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'Europe/Paris' })
  async handleDailyReconciliation() {
    this.logger.log('Starting daily Geo-Reconciliation sync...');
    try {
      await this.reconcileRecentEntities(24);
      this.logger.log('Geo-Reconciliation sync completed successfully.');
    } catch (error) {
      this.logger.error(
        `Geo-Reconciliation sync failed: ${error.message}`,
        error.stack,
      );
    }
  }

  async reconcileRecentEntities(hours: number = 24): Promise<void> {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    // 1. Fetch recent entities from PostgreSQL
    const [users, listings, events] = await Promise.all([
      this.userRepository
        .createQueryBuilder('u')
        .select(['u.id', 'u.neighbourhoodId'])
        .where('u.updatedAt >= :cutoffDate OR u.createdAt >= :cutoffDate', {
          cutoffDate,
        })
        .getMany(),
      this.listingRepository
        .createQueryBuilder('l')
        .select(['l.id', 'l.neighbourhoodId'])
        .where('l.updatedAt >= :cutoffDate OR l.createdAt >= :cutoffDate', {
          cutoffDate,
        })
        .getMany(),
      this.eventRepository
        .createQueryBuilder('e')
        .select(['e.id', 'e.neighbourhoodId'])
        .where('e.updatedAt >= :cutoffDate OR e.createdAt >= :cutoffDate', {
          cutoffDate,
        })
        .getMany(),
    ]);

    let totalFixed = 0;

    // 2. Reconcile Users
    for (const user of users) {
      if (
        await this.reconcileEntity(
          'User',
          user.id,
          user.neighbourhoodId,
          'LIVES_IN',
        )
      ) {
        totalFixed++;
      }
    }

    // 3. Reconcile Listings
    for (const listing of listings) {
      if (
        await this.reconcileEntity(
          'Listing',
          listing.id,
          listing.neighbourhoodId,
          'POSTED_IN',
        )
      ) {
        totalFixed++;
      }
    }

    // 4. Reconcile Events
    for (const event of events) {
      if (
        await this.reconcileEntity(
          'Event',
          event.id,
          event.neighbourhoodId,
          'HOSTED_IN',
        )
      ) {
        totalFixed++;
      }
    }

    this.logger.log(
      `Reconciled ${users.length + listings.length + events.length} recent entities. Fixed ${totalFixed} discrepancies.`,
    );
  }

  private async reconcileEntity(
    nodeLabel: string,
    entityPgId: string,
    pgNeighbourhoodId: string | null,
    relationshipType: string,
  ): Promise<boolean> {
    // Check Neo4j current state
    const query = `
      MATCH (e:${nodeLabel} {pg_id: $entityPgId})
      OPTIONAL MATCH (e)-[r:${relationshipType}]->(n:Neighbourhood)
      RETURN n.pg_id AS neo4jNbId
    `;
    const result = await this.neo4jService.run(query, { entityPgId });

    // If the entity node itself doesn't exist in Neo4j, we can't reconcile the link.
    // SyncModule will handle node creation.
    if (result.records.length === 0) return false;

    const neo4jNbId = result.records[0].get('neo4jNbId');

    // Mismatch 1: Postgres has a neighbourhood, Neo4j doesn't (or has a different one)
    if (pgNeighbourhoodId && neo4jNbId !== pgNeighbourhoodId) {
      this.logger.warn(
        `Mismatch detected for ${nodeLabel} ${entityPgId}: PG=${pgNeighbourhoodId}, Neo4j=${neo4jNbId}. Reconciling...`,
      );

      // Verify the neighbourhood actually exists in Neo4j to prevent orphan assignment
      const checkNbQuery = `MATCH (n:Neighbourhood {pg_id: $pgNeighbourhoodId}) RETURN n`;
      const nbResult = await this.neo4jService.run(checkNbQuery, {
        pgNeighbourhoodId,
      });

      if (nbResult.records.length > 0) {
        // Neighbourhood exists: Update Neo4j to match Postgres
        const fixQuery = `
          MATCH (e:${nodeLabel} {pg_id: $entityPgId})
          MATCH (n:Neighbourhood {pg_id: $pgNeighbourhoodId})
          OPTIONAL MATCH (e)-[oldR:${relationshipType}]->(oldN:Neighbourhood)
          DELETE oldR
          MERGE (e)-[newR:${relationshipType}]->(n)
          SET newR.updated_at = datetime()
        `;
        await this.neo4jService.run(fixQuery, {
          entityPgId,
          pgNeighbourhoodId,
        });
        this.logger.log(
          `Fixed: Created missing relationship to ${pgNeighbourhoodId} in Neo4j for ${nodeLabel} ${entityPgId}.`,
        );
      } else {
        // Neighbourhood missing in Neo4j: Update Postgres to null (orphan cleanup)
        this.logger.warn(
          `Orphan assignment: Neighbourhood ${pgNeighbourhoodId} missing in Neo4j. Clearing PG for ${nodeLabel} ${entityPgId}.`,
        );
        await this.updatePostgresNeighbourhood(nodeLabel, entityPgId, null);
      }
      return true;
    }

    // Mismatch 2: Postgres has no neighbourhood, but Neo4j has one
    if (!pgNeighbourhoodId && neo4jNbId) {
      this.logger.warn(
        `Mismatch detected for ${nodeLabel} ${entityPgId}: PG=null, Neo4j=${neo4jNbId}. Reconciling...`,
      );
      const fixQuery = `
        MATCH (e:${nodeLabel} {pg_id: $entityPgId})-[r:${relationshipType}]->(n:Neighbourhood)
        DELETE r
      `;
      await this.neo4jService.run(fixQuery, { entityPgId });
      this.logger.log(
        `Fixed: Deleted stale relationship to ${neo4jNbId} in Neo4j for ${nodeLabel} ${entityPgId}.`,
      );
      return true;
    }

    // Match: No discrepancy
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
