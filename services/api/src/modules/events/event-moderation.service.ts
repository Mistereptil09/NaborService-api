import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventModerationAction } from './entities/event-moderation-action.entity';
import { Evenement } from './entities/evenement.entity';
import { ListEventsDto, ModerateDto } from './dto/event-routes.dtos';
import { EventStatusEnum } from '../../common/enums';
import { EventsGateway } from './events.gateway';

@Injectable()
export class EventModerationService {
  constructor(
    @InjectRepository(EventModerationAction)
    private readonly moderationRepo: Repository<EventModerationAction>,
    @InjectRepository(Evenement)
    private readonly eventRepo: Repository<Evenement>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async moderate(moderatorId: string, eventId: string, dto: ModerateDto) {
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('Reason cannot be empty');
    }

    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Record action
    const actionRecord = this.moderationRepo.create({
      moderatorId,
      eventId,
      action: dto.action as any,
      reason: dto.reason.trim(),
    });
    await this.moderationRepo.save(actionRecord);

    // Apply status change
    if (dto.action === 'cancelled') {
      event.status = EventStatusEnum.CANCELLED;
      event.cancelledAt = new Date();
      await this.eventRepo.save(event);

      this.eventsGateway.emitEventCancelled(
        eventId,
        `Moderation: ${dto.reason}`,
        event.cancelledAt,
      );

      // Note: Refund logic would normally be triggered here or enqueued.
      // For brevity, assuming state machine or a worker handles cancellation refunds.
    } else if (dto.action === 'restored') {
      event.status = EventStatusEnum.OPEN; // Or previous state
      event.cancelledAt = null;
      await this.eventRepo.save(event);
    }
    // 'warned' does not change event status

    return actionRecord;
  }

  async getModerationHistory(eventId: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.moderationRepo.find({
      where: { eventId },
      order: { createdAt: 'DESC' },
      relations: ['moderator'],
    });
  }

  async getAllModerationActions(query: ListEventsDto): Promise<{
    data: EventModerationAction[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const [data, total] = await this.moderationRepo.findAndCount({
      skip: query.offset,
      take: query.limit,
      order: { createdAt: 'DESC' },
      relations: ['moderator', 'event'],
    });

    return { data, meta: { total, offset: query.offset, limit: query.limit } };
  }
}
