import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class Neo4jRecoveryService {
  private readonly logger = new Logger(Neo4jRecoveryService.name);

  constructor(
    @InjectQueue('neo4j-sync') private readonly neo4jSyncQueue: Queue,
  ) {}

  @Cron('*/15 * * * *')
  async recoverFailedJobs(): Promise<void> {
    try {
      const failedJobs = await this.neo4jSyncQueue.getFailed(0, 100);

      if (failedJobs.length === 0) return;

      let recovered = 0;
      let skipped = 0;

      for (const job of failedJobs) {
        try {
          await job.retry();
          recovered++;
        } catch {
          skipped++;
        }
      }

      if (recovered > 0 || skipped > 0) {
        this.logger.log(
          `Neo4j recovery: ${recovered} jobs requeued, ${skipped} skipped (total failed: ${failedJobs.length})`,
        );
      }
    } catch (error) {
      this.logger.warn(`Neo4j recovery skipped: ${(error as Error).message}`);
    }
  }
}
