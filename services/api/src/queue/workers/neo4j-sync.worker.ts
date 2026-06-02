import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { Neo4jSyncJobPayload } from '../interfaces/job-payloads';
import { classifyAndThrow } from '../utils/error-classifier';
import { getBackoffDelay } from '../utils/backoff-strategy';
import { Neo4jSyncService } from '../../database/neo4j/neo4j-sync.service';

@Processor('neo4j-sync', {
  concurrency: 1,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom'
        ? getBackoffDelay('neo4j-sync', attemptsMade)
        : 1000;
    },
  },
})
export class Neo4jSyncWorker extends WorkerHost {
  private readonly logger = new Logger(Neo4jSyncWorker.name);

  constructor(private readonly neo4jSyncService: Neo4jSyncService) {
    super();
  }

  async process(job: Job<Neo4jSyncJobPayload>): Promise<any> {
    try {
      const operation = job.name || (job.data as any).operation;
      const data = (job.data as any).data || job.data;

      switch (operation) {
        case 'upsert-user':
          await this.neo4jSyncService.upsertUser(data);
          break;
        case 'upsert-listing':
          await this.neo4jSyncService.upsertListing({
            pgId: data.id || data.pgId,
            listingType: data.listing_type || data.listingType,
            status: data.status,
            neighbourhoodId: data.neighbourhood_id || data.neighbourhoodId,
            createdAt: new Date(
              data.createdAt || data.created_at || Date.now(),
            ),
          });
          break;
        case 'upsert-event':
          await this.neo4jSyncService.upsertEvent({
            pgId: data.id || data.pgId,
            status: data.status,
            neighbourhoodId: data.neighbourhood_id || data.neighbourhoodId,
            startsAt: new Date(data.startsAt || data.starts_at || Date.now()),
            costCents:
              data.cost_cents !== undefined ? data.cost_cents : data.costCents,
          });
        case 'update-relationship':
          if (data.type === 'FOLLOWS') {
            await this.neo4jSyncService.createFollows(
              data.followerId,
              data.followedId,
            );
          } else if (data.type === 'LIVES_IN') {
            await this.neo4jSyncService.createLivesIn(
              data.userId,
              data.neighbourhoodId,
            );
          } else if (data.type === 'UNFOLLOWS') {
            await this.neo4jSyncService.deleteFollows(
              data.followerId,
              data.followedId,
            );
          }
          break;
        case 'update-properties':
          if (data.entityType === 'event' && data.status) {
            await this.neo4jSyncService.updateEventStatus(
              data.pgId,
              data.status,
            );
          }
          break;
        case 'user.follows.create':
          await this.neo4jSyncService.createFollows(
            data.followerId,
            data.followedId,
          );
          break;
        case 'user.follows.delete':
          await this.neo4jSyncService.deleteFollows(
            data.followerId,
            data.followedId,
          );
          break;
        case 'user.friends_with.create':
          await this.neo4jSyncService.createFriendsWith(
            data.userId1,
            data.userId2,
          );
          break;
        case 'user.friends_with.delete':
          await this.neo4jSyncService.deleteFriendsWith(
            data.userId1,
            data.userId2,
          );
          break;
        case 'user.swipe':
          await this.neo4jSyncService.createSwipe(
            data.swiperId,
            data.swipedId,
            data.direction,
          );
        case 'user.blocks.create':
          await this.neo4jSyncService.createBlocks(
            data.blockerId,
            data.blockedId,
          );
          break;
        case 'user.blocks.delete':
          await this.neo4jSyncService.deleteBlocks(
            data.blockerId,
            data.blockedId,
          );
          break;
        case 'user.lives_in.update':
          await this.neo4jSyncService.deleteLivesIn(data.userId);
          if (data.neighbourhoodId) {
            await this.neo4jSyncService.createLivesIn(
              data.userId,
              data.neighbourhoodId,
            );
          }
          break;
        case 'user.soft_delete':
          await this.neo4jSyncService.softDeleteUser(
            data.userId,
            new Date(data.deletedAt),
          );
          break;
        case 'delete-listing':
          await this.neo4jSyncService.deleteListing(data.id);
          break;
        case 'create-posted-in':
          await this.neo4jSyncService.createPostedIn(
            data.listingId,
            data.neighbourhoodId,
          );
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error: any) {
      classifyAndThrow(error);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<Neo4jSyncJobPayload>, error: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.error({
        queue: 'neo4j-sync',
        jobName: job.name,
        payloadIdentifier:
          job.data.data?.pgId || job.data.data?.id || 'unknown',
        failureReason: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
