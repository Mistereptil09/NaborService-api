import { Injectable } from '@nestjs/common';
import { Neo4jService } from './neo4j.service';
import {
  UpsertUserDto,
  UpsertListingDto,
  UpsertEventDto,
  UpsertCategoryDto,
} from './interfaces/neo4j-sync.interfaces';

@Injectable()
export class Neo4jSyncService {
  constructor(private readonly neo4jService: Neo4jService) {}

  // ==========================================
  // NODE OPERATIONS
  // ==========================================

  async upsertUser(data: UpsertUserDto): Promise<void> {
    const cypher = `
      MERGE (u:User { pg_id: $pgId })
      ON CREATE SET 
        u.visibility = $visibility,
        u.role = $role,
        u.neighbourhood_id = $neighbourhoodId
      ON MATCH SET 
        u.visibility = $visibility,
        u.role = $role,
        u.neighbourhood_id = $neighbourhoodId
    `;
    await this.neo4jService.run(cypher, {
      pgId: data.pgId,
      visibility: data.visibility,
      role: data.role,
      neighbourhoodId: data.neighbourhoodId || null,
    });
  }

  async softDeleteUser(pgId: string, deletedAt: Date): Promise<void> {
    const cypher = `
      MATCH (u:User { pg_id: $pgId })
      SET u.deleted_at = $deletedAt
    `;
    await this.neo4jService.run(cypher, {
      pgId,
      deletedAt: deletedAt.toISOString(),
    });
  }

  async upsertListing(data: UpsertListingDto): Promise<void> {
    const cypher = `
      MERGE (l:Listing { pg_id: $pgId })
      ON CREATE SET 
        l.listing_type = $listingType,
        l.status = $status,
        l.neighbourhood_id = $neighbourhoodId,
        l.created_at = $createdAt
      ON MATCH SET 
        l.listing_type = $listingType,
        l.status = $status,
        l.neighbourhood_id = $neighbourhoodId
    `;
    await this.neo4jService.run(cypher, {
      pgId: data.pgId,
      listingType: data.listingType,
      status: data.status,
      neighbourhoodId: data.neighbourhoodId || null,
      createdAt: data.createdAt.toISOString(),
    });
  }

  async deleteListing(pgId: string): Promise<void> {
    const cypher = `
      MATCH (l:Listing { pg_id: $pgId })
      DETACH DELETE l
    `;
    await this.neo4jService.run(cypher, { pgId });
  }

  async upsertEvent(data: UpsertEventDto): Promise<void> {
    const cypher = `
      MERGE (e:Event { pg_id: $pgId })
      ON CREATE SET 
        e.status = $status,
        e.neighbourhood_id = $neighbourhoodId,
        e.starts_at = $startsAt,
        e.cost_cents = $costCents
      ON MATCH SET 
        e.status = $status,
        e.neighbourhood_id = $neighbourhoodId,
        e.starts_at = $startsAt,
        e.cost_cents = $costCents
    `;
    await this.neo4jService.run(cypher, {
      pgId: data.pgId,
      status: data.status,
      neighbourhoodId: data.neighbourhoodId || null,
      startsAt: data.startsAt.toISOString(),
      costCents: data.costCents,
    });
  }

  async updateEventStatus(pgId: string, status: string): Promise<void> {
    const cypher = `
      MATCH (e:Event { pg_id: $pgId })
      SET e.status = $status
    `;
    await this.neo4jService.run(cypher, { pgId, status });
  }

  async upsertCategory(data: UpsertCategoryDto): Promise<void> {
    const cypher = `
      MERGE (c:Category { pg_id: $pgId })
      ON CREATE SET 
        c.name = $name,
        c.domain = $domain
      ON MATCH SET 
        c.name = $name,
        c.domain = $domain
    `;
    await this.neo4jService.run(cypher, {
      pgId: data.pgId,
      name: data.name,
      domain: data.domain,
    });
  }

  // ==========================================
  // RELATIONSHIP OPERATIONS
  // ==========================================

  async createLivesIn(userPgId: string, neighbourhoodPgId: string): Promise<void> {
    const cypher = `
      MATCH (u:User { pg_id: $userPgId }), (n:Neighbourhood { pg_id: $neighbourhoodPgId })
      MERGE (u)-[:LIVES_IN]->(n)
    `;
    await this.neo4jService.run(cypher, { userPgId, neighbourhoodPgId });
  }

  async deleteLivesIn(userPgId: string): Promise<void> {
    const cypher = `
      MATCH (u:User { pg_id: $userPgId })-[r:LIVES_IN]->()
      DELETE r
    `;
    await this.neo4jService.run(cypher, { userPgId });
  }

  async createFollows(followerPgId: string, followedPgId: string): Promise<void> {
    const cypher = `
      MATCH (u1:User { pg_id: $followerPgId }), (u2:User { pg_id: $followedPgId })
      MERGE (u1)-[r:FOLLOWS]->(u2)
      ON CREATE SET r.since = datetime()
    `;
    await this.neo4jService.run(cypher, { followerPgId, followedPgId });
  }

  async deleteFollows(followerPgId: string, followedPgId: string): Promise<void> {
    const cypher = `
      MATCH (u1:User { pg_id: $followerPgId })-[r:FOLLOWS]->(u2:User { pg_id: $followedPgId })
      DELETE r
    `;
    await this.neo4jService.run(cypher, { followerPgId, followedPgId });
  }

  async createSwipe(swiperPgId: string, swipedPgId: string, direction: string): Promise<void> {
    const cypher = `
      MATCH (u1:User { pg_id: $swiperPgId }), (u2:User { pg_id: $swipedPgId })
      MERGE (u1)-[r:SWIPED { direction: $direction }]->(u2)
      ON CREATE SET r.at = datetime()
    `;
    await this.neo4jService.run(cypher, { swiperPgId, swipedPgId, direction });
  }

  async createFriendsWith(userPgId1: string, userPgId2: string): Promise<void> {
    const cypher = `
      MATCH (u1:User { pg_id: $userPgId1 }), (u2:User { pg_id: $userPgId2 })
      MERGE (u1)-[r:FRIENDS_WITH]-(u2)
      ON CREATE SET r.since = datetime()
    `;
    await this.neo4jService.run(cypher, { userPgId1, userPgId2 });
  }

  async deleteFriendsWith(userPgId1: string, userPgId2: string): Promise<void> {
    const cypher = `
      MATCH (u1:User { pg_id: $userPgId1 })-[r:FRIENDS_WITH]-(u2:User { pg_id: $userPgId2 })
      DELETE r
    `;
    await this.neo4jService.run(cypher, { userPgId1, userPgId2 });
  }

  async createBlocks(blockerPgId: string, blockedPgId: string): Promise<void> {
    const cypher = `
      MATCH (u1:User { pg_id: $blockerPgId }), (u2:User { pg_id: $blockedPgId })
      MERGE (u1)-[:BLOCKS]->(u2)
    `;
    await this.neo4jService.run(cypher, { blockerPgId, blockedPgId });
  }

  async deleteBlocks(blockerPgId: string, blockedPgId: string): Promise<void> {
    const cypher = `
      MATCH (u1:User { pg_id: $blockerPgId })-[r:BLOCKS]->(u2:User { pg_id: $blockedPgId })
      DELETE r
    `;
    await this.neo4jService.run(cypher, { blockerPgId, blockedPgId });
  }

  async createPostedIn(listingPgId: string, neighbourhoodPgId: string): Promise<void> {
    const cypher = `
      MATCH (l:Listing { pg_id: $listingPgId }), (n:Neighbourhood { pg_id: $neighbourhoodPgId })
      MERGE (l)-[:POSTED_IN]->(n)
    `;
    await this.neo4jService.run(cypher, { listingPgId, neighbourhoodPgId });
  }

  async createHostedIn(eventPgId: string, neighbourhoodPgId: string): Promise<void> {
    const cypher = `
      MATCH (e:Event { pg_id: $eventPgId }), (n:Neighbourhood { pg_id: $neighbourhoodPgId })
      MERGE (e)-[:HOSTED_IN]->(n)
    `;
    await this.neo4jService.run(cypher, { eventPgId, neighbourhoodPgId });
  }

  async createLikedListing(userPgId: string, listingPgId: string): Promise<void> {
    const cypher = `
      MATCH (u:User { pg_id: $userPgId }), (l:Listing { pg_id: $listingPgId })
      MERGE (u)-[r:LIKED_LISTING]->(l)
      ON CREATE SET r.at = datetime()
    `;
    await this.neo4jService.run(cypher, { userPgId, listingPgId });
  }

  async createLikedEvent(userPgId: string, eventPgId: string): Promise<void> {
    const cypher = `
      MATCH (u:User { pg_id: $userPgId }), (e:Event { pg_id: $eventPgId })
      MERGE (u)-[r:LIKED_EVENT]->(e)
      ON CREATE SET r.at = datetime()
    `;
    await this.neo4jService.run(cypher, { userPgId, eventPgId });
  }

  async createAttendedEvent(userPgId: string, eventPgId: string): Promise<void> {
    const cypher = `
      MATCH (u:User { pg_id: $userPgId }), (e:Event { pg_id: $eventPgId })
      MERGE (u)-[r:ATTENDED_EVENT]->(e)
      ON CREATE SET r.at = datetime()
    `;
    await this.neo4jService.run(cypher, { userPgId, eventPgId });
  }

  async mergeInterestedIn(userPgId: string, categoryPgId: number): Promise<void> {
    const cypher = `
      MATCH (u:User { pg_id: $userPgId }), (c:Category { pg_id: $categoryPgId })
      MERGE (u)-[r:INTERESTED_IN]->(c)
      ON CREATE SET r.weight = 1
      ON MATCH SET r.weight = coalesce(r.weight, 0) + 1
    `;
    await this.neo4jService.run(cypher, { userPgId, categoryPgId });
  }
}
