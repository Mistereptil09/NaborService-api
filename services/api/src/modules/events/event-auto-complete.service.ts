import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evenement } from './entities/evenement.entity';
import { EventStatusEnum } from '../../common/enums';

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
