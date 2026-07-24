import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventReport } from './entities/event-report.entity';
import { Evenement } from './entities/evenement.entity';
import { ListEventsDto } from './dto/event-routes.dtos';

@Injectable()
export class EventReportService {
  constructor(
    @InjectRepository(EventReport)
    private readonly reportRepo: Repository<EventReport>,
    @InjectRepository(Evenement)
    private readonly eventRepo: Repository<Evenement>,
  ) {}

  async createReport(reporterId: string, eventId: string, reason: string) {
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Reason cannot be empty');
    }

    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const report = this.reportRepo.create({
      reporterId,
      eventId,
      reason: reason.trim(),
    });

    await this.reportRepo.save(report);
    return report;
  }

  async getReportedEvents(query: ListEventsDto) {
    const qb = this.reportRepo
      .createQueryBuilder('report')
      .select('report.eventId', 'eventId')
      .addSelect('COUNT(report.id)', 'reportCount')
      .addSelect('MAX(report.createdAt)', 'lastReportedAt')
      .groupBy('report.eventId')
      .orderBy('"reportCount"', 'DESC')
      .addOrderBy('"lastReportedAt"', 'DESC')
      .skip(query.offset)
      .take(query.limit);

    const rawResults = await qb.getRawMany();

    const eventIds = rawResults.map((r) => r.eventId);
    if (eventIds.length === 0) {
      return {
        data: [],
        meta: { total: 0, offset: query.offset, limit: query.limit },
      };
    }

    const events = await this.eventRepo.findByIds(eventIds);
    const eventMap = new Map(events.map((e) => [e.id, e]));

    const data = rawResults
      .map((r) => ({
        event: eventMap.get(r.eventId),
        reportCount: parseInt(r.reportCount, 10),
        lastReportedAt: r.lastReportedAt,
      }))
      .filter(
        (
          item,
        ): item is {
          event: Evenement;
          reportCount: number;
          lastReportedAt: Date;
        } => item.event !== undefined,
      );

    const totalCountQuery = await this.reportRepo
      .createQueryBuilder('report')
      .select('COUNT(DISTINCT report.eventId)', 'total')
      .getRawOne();

    return {
      data,
      meta: {
        total: parseInt(totalCountQuery.total, 10),
        offset: query.offset,
        limit: query.limit,
      },
    };
  }
}
