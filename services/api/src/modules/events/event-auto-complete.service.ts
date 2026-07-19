import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evenement } from './entities/evenement.entity';
import { EventStatusEnum } from '../../common/enums';

/**
 * Periodically closes events whose scheduled time has elapsed.
 *
 * Runs every 15 minutes and transitions open events past their
 * `ends_at ?? starts_at` into `completed`. This is a system path:
 * unlike EventStateMachineService.complete(), it deliberately skips
 * the organiser/ownership check so past events cannot linger `open`
 * and keep accepting registrations indefinitely.
 */
@Injectable()
export class EventAutoCompleteService {
  private readonly logger = new Logger(EventAutoCompleteService.name);

  constructor(
    @InjectRepository(Evenement)
    private readonly eventRepo: Repository<Evenement>,
  ) {}

  @Cron('*/15 * * * *')
  async completeElapsedEvents(): Promise<void> {
    try {
      const now = new Date();

      // ends_at when present, otherwise starts_at, must be in the past.
      const result = await this.eventRepo
        .createQueryBuilder()
        .update(Evenement)
        .set({ status: EventStatusEnum.COMPLETED, completedAt: now })
        .where('status = :status', { status: EventStatusEnum.OPEN })
        .andWhere('COALESCE(ends_at, starts_at) IS NOT NULL')
        .andWhere('COALESCE(ends_at, starts_at) < :now', { now })
        .execute();

      const closed = result.affected ?? 0;
      if (closed > 0) {
        this.logger.log(`Auto-complete: ${closed} elapsed event(s) closed`);
      }
    } catch (error) {
      this.logger.warn(`Auto-complete skipped: ${(error as Error).message}`);
    }
  }
}
