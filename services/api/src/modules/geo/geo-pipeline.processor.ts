import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BanService } from './ban.service';
import { Neo4jGeoService } from './neo4j-geo.service';
import { Neo4jService } from '../../database/neo4j/neo4j.service';
import { User } from '../users/entities/user.entity';
import { Listing } from '../listings/entities/listing.entity';
import { Evenement } from '../events/entities/evenement.entity';

export interface GeocodingJobPayload {
  entityType: 'user' | 'listing' | 'event';
  entityId: string;
  address: string;
}

@Injectable()
export class GeoPipelineProcessor {
  private readonly logger = new Logger(GeoPipelineProcessor.name);

  constructor(
    private readonly banService: BanService,
    private readonly neo4jGeoService: Neo4jGeoService,
    private readonly neo4jService: Neo4jService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(Evenement)
    private readonly eventRepository: Repository<Evenement>,
  ) {}

  async processUserGeocode(userId: string, address: string): Promise<void> {
    await this.orchestrateGeocoding('User', userId, address, 'LIVES_IN');
  }

  async processListingGeocode(
    listingId: string,
    address: string,
  ): Promise<void> {
    await this.orchestrateGeocoding('Listing', listingId, address, 'POSTED_IN');
  }

  async processEventGeocode(eventId: string, address: string): Promise<void> {
    await this.orchestrateGeocoding('Event', eventId, address, 'HOSTED_IN');
  }

  async deleteEntityGeocoding(
    nodeLabel: string,
    entityPgId: string,
  ): Promise<void> {
    await this.updatePostgresNeighbourhood(nodeLabel, entityPgId, null);
    const query = `
      MATCH (e:${nodeLabel} {pg_id: $entityPgId})-[r:LIVES_IN|POSTED_IN|HOSTED_IN]->(n:Neighbourhood)
      DELETE r
    `;
    await this.neo4jService.run(query, { entityPgId });
    this.logger.log(
      `Deleted all geographic relationships for ${nodeLabel} ${entityPgId} (RGPD compliance)`,
    );
  }

  private async orchestrateGeocoding(
    nodeLabel: string,
    entityPgId: string,
    address: string,
    relationshipType: string,
  ): Promise<void> {
    const delays = [1000, 5000, 30000];
    let attempt = 0;

    while (true) {
      try {
        this.logger.debug(
          `Geocoding ${nodeLabel} ${entityPgId} at address: ${address}`,
        );

        const geoResult = await this.banService.geocode(address);
        this.logger.debug(`BAN Result confidence: ${geoResult.confidence}`);

        const assignment = await this.neo4jGeoService.assignNeighbourhood(
          geoResult.latitude,
          geoResult.longitude,
        );

        if (!assignment) {
          this.logger.warn(
            `No neighbourhood found for ${nodeLabel} ${entityPgId}. Removing existing geographic links.`,
          );
          await this.updatePostgresNeighbourhood(nodeLabel, entityPgId, null);
          await this.removeExistingRelationship(
            nodeLabel,
            entityPgId,
            relationshipType,
          );
          return;
        }

        this.logger.debug(
          `Assigned to neighbourhood ${assignment.neighbourhoodId} via ${assignment.method}`,
        );
        await this.updatePostgresNeighbourhood(
          nodeLabel,
          entityPgId,
          assignment.neighbourhoodId,
        );
        await this.upsertRelationship(
          nodeLabel,
          entityPgId,
          assignment.neighbourhoodId,
          relationshipType,
        );

        return; // Success, exit retry loop
      } catch (error) {
        if (attempt < delays.length) {
          this.logger.warn(
            `Failed to process geocoding for ${nodeLabel} ${entityPgId} (Attempt ${attempt + 1}/${delays.length + 1}). Retrying in ${delays[attempt]}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
          attempt++;
          continue;
        }

        this.logger.error(
          `Failed to process geocoding for ${nodeLabel} ${entityPgId} after ${attempt + 1} attempts: ${error.message}`,
          error.stack,
        );
        throw error;
      }
    }
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

  private async removeExistingRelationship(
    nodeLabel: string,
    entityPgId: string,
    relationshipType: string,
  ): Promise<void> {
    const query = `
      MATCH (e:${nodeLabel} {pg_id: $entityPgId})-[r:${relationshipType}]->(n:Neighbourhood)
      DELETE r
    `;
    await this.neo4jService.run(query, { entityPgId });
  }

  private async upsertRelationship(
    nodeLabel: string,
    entityPgId: string,
    neighbourhoodId: string,
    relationshipType: string,
  ): Promise<void> {
    const query = `
      MATCH (e:${nodeLabel} {pg_id: $entityPgId})
      MATCH (n:Neighbourhood {pg_id: $neighbourhoodId})
      
      // Delete old relationships
      OPTIONAL MATCH (e)-[oldR:${relationshipType}]->(oldN:Neighbourhood)
      DELETE oldR
      
      // Create new relationship
      MERGE (e)-[newR:${relationshipType}]->(n)
      SET newR.updated_at = datetime()
    `;

    await this.neo4jService.run(query, { entityPgId, neighbourhoodId });
  }
}
