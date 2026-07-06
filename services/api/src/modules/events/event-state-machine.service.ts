import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evenement } from './entities/evenement.entity';
import { EventParticipant } from './entities/event-participant.entity';
import { ChatGroup } from '../messaging/entities/chat-group.entity';
import {
  EventStatusEnum,
  ChatGroupTypeEnum,
  ParticipantStatusEnum,
  PaymentStatusEnum,
} from '../../common/enums';
import { isModeratorOrAdmin } from '../../common/ownership';
import { EventsGateway } from './events.gateway';
import { NotificationsService } from '../messaging/notifications.service';

@Injectable()
export class EventStateMachineService {
  private readonly logger = new Logger(EventStateMachineService.name);

  constructor(
    @InjectRepository(Evenement)
    private readonly eventRepo: Repository<Evenement>,
    @InjectRepository(EventParticipant)
    private readonly participantRepo: Repository<EventParticipant>,
    @InjectRepository(ChatGroup)
    private readonly chatGroupRepo: Repository<ChatGroup>,
    private readonly eventsGateway: EventsGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async publish(eventId: string, organiserId: string, userRole?: string) {
    const event = await this.getEventAndCheckOwner(eventId, organiserId, userRole);

    if (event.status !== EventStatusEnum.DRAFT) {
      throw new ConflictException('Event is not in draft state');
    }

    event.status = EventStatusEnum.PUBLISHED;
    event.publishedAt = new Date();

    // Create chat group
    const chatGroup = this.chatGroupRepo.create({
      name: `Chat: ${event.title}`,
      createdBy: organiserId,
      type: ChatGroupTypeEnum.GROUP_CHAT,
    });
    const savedGroup = await this.chatGroupRepo.save(chatGroup);

    event.groupId = savedGroup.id;
    await this.eventRepo.save(event);

    return { success: true };
  }

  async open(eventId: string, organiserId: string, userRole?: string) {
    const event = await this.getEventAndCheckOwner(eventId, organiserId, userRole);

    if (event.status !== EventStatusEnum.PUBLISHED) {
      throw new ConflictException('Event must be published before opening');
    }

    event.status = EventStatusEnum.OPEN;
    await this.eventRepo.save(event);

    return { success: true };
  }

  async complete(eventId: string, organiserId: string, userRole?: string) {
    const event = await this.getEventAndCheckOwner(eventId, organiserId, userRole);

    if (event.status !== EventStatusEnum.OPEN) {
      throw new ConflictException('Event must be open to be completed');
    }

    event.status = EventStatusEnum.COMPLETED;
    event.completedAt = new Date();
    await this.eventRepo.save(event);

    return { success: true };
  }

  async cancel(eventId: string, organiserId: string, reason: string, userRole?: string) {
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Cancel reason cannot be empty');
    }

    const event = await this.getEventAndCheckOwner(eventId, organiserId, userRole);

    if (
      event.status === EventStatusEnum.COMPLETED ||
      event.status === EventStatusEnum.CANCELLED
    ) {
      throw new ConflictException(
        'Cannot cancel a completed or already cancelled event',
      );
    }

    event.status = EventStatusEnum.CANCELLED;
    event.cancelledAt = new Date();
    await this.eventRepo.save(event);

    // Refund logic
    const participants = await this.participantRepo.find({
      where: {
        eventId,
        status: ParticipantStatusEnum.REGISTERED,
        paymentStatus: PaymentStatusEnum.COMPLETED,
      },
    });

    for (const p of participants) {
      const hoursSinceRegistration =
        (event.cancelledAt.getTime() - p.registeredAt.getTime()) /
        (1000 * 60 * 60);
      if (hoursSinceRegistration <= event.refundDeadlineHours) {
        // Trigger refund (Mock Stripe integration)
        p.paymentStatus = PaymentStatusEnum.REFUNDED;
        p.refundedAt = new Date();
        p.refundStripeId = `re_mock_${p.userId}_${eventId}`;
        await this.participantRepo.save(p);
      }
    }

    // Emit Socket.io event
    this.eventsGateway.emitEventCancelled(eventId, reason, event.cancelledAt);

    // Notify every registered participant (essential — they must be informed).
    const registered = await this.participantRepo.find({
      where: { eventId, status: ParticipantStatusEnum.REGISTERED },
      select: ['userId'],
    });
    for (const participant of registered) {
      try {
        await this.notificationsService.create({
          userId: participant.userId,
          type: 'event_cancelled',
          payload: { eventTitle: event.title, eventId, reason },
        });
      } catch (error: any) {
        this.logger.warn(
          `event_cancelled notification failed for ${participant.userId}: ${error?.message ?? error}`,
        );
      }
    }

    return { success: true };
  }

  private async getEventAndCheckOwner(eventId: string, organiserId: string, userRole?: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.creatorId !== organiserId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException(
        'Only the organiser can perform this action',
      );
    }
    return event;
  }
}
