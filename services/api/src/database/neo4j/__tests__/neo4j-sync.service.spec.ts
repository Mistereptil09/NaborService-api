import { Neo4jSyncService } from '../neo4j-sync.service';
import { Neo4jService } from '../neo4j.service';

describe('Neo4jSyncService', () => {
  let service: Neo4jSyncService;
  let mockNeo4jService: jest.Mocked<Neo4jService>;

  beforeEach(() => {
    mockNeo4jService = {
      run: jest.fn().mockResolvedValue({ records: [] }),
    } as unknown as jest.Mocked<Neo4jService>;

    service = new Neo4jSyncService(mockNeo4jService);
  });

  describe('Node Sync Operations', () => {
    it('should upsert user using MERGE and correct parameters', async () => {
      const dto = {
        pgId: 'usr_123',
        visibility: 'public' as const,
        role: 'resident' as const,
        neighbourhoodId: 'hood_123',
      };

      await service.upsertUser(dto);

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
      const [cypher, params] = mockNeo4jService.run.mock.calls[0];
      expect(cypher).toContain('MERGE (u:User { pg_id: $pgId })');
      expect(cypher).toContain('u.visibility = $visibility');
      expect(params).toEqual({
        pgId: 'usr_123',
        visibility: 'public',
        role: 'resident',
        neighbourhoodId: 'hood_123',
      });
    });

    it('should soft delete user', async () => {
      const deletedAt = new Date();
      await service.softDeleteUser('usr_123', deletedAt);

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
      const [cypher, params] = mockNeo4jService.run.mock.calls[0];
      expect(cypher).toContain('MATCH (u:User { pg_id: $pgId })');
      expect(cypher).toContain('SET u.deleted_at = $deletedAt');
      expect(params).toEqual({
        pgId: 'usr_123',
        deletedAt: deletedAt.toISOString(),
      });
    });

    it('should upsert listing', async () => {
      const createdAt = new Date();
      const dto = {
        pgId: 'lst_123',
        listingType: 'offer' as const,
        status: 'active',
        neighbourhoodId: 'hood_123',
        createdAt,
      };

      await service.upsertListing(dto);

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
      const [cypher, params] = mockNeo4jService.run.mock.calls[0];
      expect(cypher).toContain('MERGE (l:Listing { pg_id: $pgId })');
      expect(params).toEqual({
        pgId: 'lst_123',
        listingType: 'offer',
        status: 'active',
        neighbourhoodId: 'hood_123',
        createdAt: createdAt.toISOString(),
      });
    });

    it('should delete listing', async () => {
      await service.deleteListing('lst_123');

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
      const [cypher, params] = mockNeo4jService.run.mock.calls[0];
      expect(cypher).toContain('MATCH (l:Listing { pg_id: $pgId })');
      expect(cypher).toContain('DETACH DELETE l');
      expect(params).toEqual({ pgId: 'lst_123' });
    });

    it('should upsert event', async () => {
      const startsAt = new Date();
      const dto = {
        pgId: 'evt_123',
        status: 'published',
        neighbourhoodId: 'hood_123',
        startsAt,
        costCents: 1500,
      };

      await service.upsertEvent(dto);

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
      const [cypher, params] = mockNeo4jService.run.mock.calls[0];
      expect(cypher).toContain('MERGE (e:Event { pg_id: $pgId })');
      expect(params).toEqual({
        pgId: 'evt_123',
        status: 'published',
        neighbourhoodId: 'hood_123',
        startsAt: startsAt.toISOString(),
        costCents: 1500,
      });
    });

    it('should update event status', async () => {
      await service.updateEventStatus('evt_123', 'cancelled');

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
      const [cypher, params] = mockNeo4jService.run.mock.calls[0];
      expect(cypher).toContain('MATCH (e:Event { pg_id: $pgId })');
      expect(cypher).toContain('SET e.status = $status');
      expect(params).toEqual({ pgId: 'evt_123', status: 'cancelled' });
    });

    it('should upsert category', async () => {
      const dto = {
        pgId: 5,
        name: 'Services',
        domain: 'listing' as const,
      };

      await service.upsertCategory(dto);

      expect(mockNeo4jService.run).toHaveBeenCalledTimes(1);
      const [cypher, params] = mockNeo4jService.run.mock.calls[0];
      expect(cypher).toContain('MERGE (c:Category { pg_id: $pgId })');
      expect(params).toEqual({ pgId: 5, name: 'Services', domain: 'listing' });
    });
  });

  describe('Relationship Operations', () => {
    it('should create LivesIn relation', async () => {
      await service.createLivesIn('usr_1', 'hood_1');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (u)-[:LIVES_IN]->(n)'),
        { userPgId: 'usr_1', neighbourhoodPgId: 'hood_1' },
      );
    });

    it('should delete LivesIn relation', async () => {
      await service.deleteLivesIn('usr_1');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (u:User { pg_id: $userPgId })-[r:LIVES_IN]->()',
        ),
        { userPgId: 'usr_1' },
      );
    });

    it('should create Follows relation', async () => {
      await service.createFollows('usr_1', 'usr_2');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (u1)-[r:FOLLOWS]->(u2)'),
        { followerPgId: 'usr_1', followedPgId: 'usr_2' },
      );
    });

    it('should delete Follows relation', async () => {
      await service.deleteFollows('usr_1', 'usr_2');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (u1:User { pg_id: $followerPgId })-[r:FOLLOWS]->(u2:User { pg_id: $followedPgId })',
        ),
        { followerPgId: 'usr_1', followedPgId: 'usr_2' },
      );
    });

    it('should create FriendsWith relation', async () => {
      await service.createFriendsWith('usr_1', 'usr_2');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (u1)-[r:FRIENDS_WITH]-(u2)'),
        { userPgId1: 'usr_1', userPgId2: 'usr_2' },
      );
    });

    it('should delete FriendsWith relation', async () => {
      await service.deleteFriendsWith('usr_1', 'usr_2');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (u1:User { pg_id: $userPgId1 })-[r:FRIENDS_WITH]-(u2:User { pg_id: $userPgId2 })',
        ),
        { userPgId1: 'usr_1', userPgId2: 'usr_2' },
      );
    });

    it('should create Blocks relation', async () => {
      await service.createBlocks('usr_1', 'usr_2');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (u1)-[:BLOCKS]->(u2)'),
        { blockerPgId: 'usr_1', blockedPgId: 'usr_2' },
      );
    });

    it('should delete Blocks relation', async () => {
      await service.deleteBlocks('usr_1', 'usr_2');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (u1:User { pg_id: $blockerPgId })-[r:BLOCKS]->(u2:User { pg_id: $blockedPgId })',
        ),
        { blockerPgId: 'usr_1', blockedPgId: 'usr_2' },
      );
    });

    it('should create PostedIn relation', async () => {
      await service.createPostedIn('lst_1', 'hood_1');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (l)-[:POSTED_IN]->(n)'),
        { listingPgId: 'lst_1', neighbourhoodPgId: 'hood_1' },
      );
    });

    it('should create HostedIn relation', async () => {
      await service.createHostedIn('evt_1', 'hood_1');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (e)-[:HOSTED_IN]->(n)'),
        { eventPgId: 'evt_1', neighbourhoodPgId: 'hood_1' },
      );
    });

    it('should create LikedListing relation', async () => {
      await service.createLikedListing('usr_1', 'lst_1');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (u)-[r:LIKED_LISTING]->(l)'),
        { userPgId: 'usr_1', listingPgId: 'lst_1' },
      );
    });

    it('should create LikedEvent relation', async () => {
      await service.createLikedEvent('usr_1', 'evt_1');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (u)-[r:LIKED_EVENT]->(e)'),
        { userPgId: 'usr_1', eventPgId: 'evt_1' },
      );
    });

    it('should create AttendedEvent relation', async () => {
      await service.createAttendedEvent('usr_1', 'evt_1');
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (u)-[r:ATTENDED_EVENT]->(e)'),
        { userPgId: 'usr_1', eventPgId: 'evt_1' },
      );
    });

    it('should merge InterestedIn relation with weights', async () => {
      await service.mergeInterestedIn('usr_1', 12);
      expect(mockNeo4jService.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (u)-[r:INTERESTED_IN]->(c)'),
        { userPgId: 'usr_1', categoryPgId: 12 },
      );
    });
  });
});
