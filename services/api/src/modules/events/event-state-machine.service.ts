import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Evenement } from './entities/evenement.entity';
import { EventParticipant } from './entities/event-participant.entity';
import { ChatGroup } from '../messaging/entities/chat-group.entity';
import {
  EventStatusEnum,
  ChatGroupTypeEnum,
  ParticipantStatusEnum,
  PaymentStatusEnum,
  PointsLedgerEntryTypeEnum,
} from '../../common/enums';
import { isModeratorOrAdmin } from '../../common/ownership';
import { EventsGateway } from './events.gateway';
import { NotificationsService } from '../messaging/notifications.service';
import { PointsService } from '../points/points.service';
import { AdminConfigService } from '../admin/admin-config.service';

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
    private readonly pointsService: PointsService,
    private readonly adminConfigService: AdminConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async publish(eventId: string, organiserId: string, userRole?: string) {
    const event = await this.getEventAndCheckOwner(
      eventId,
      organiserId,
      userRole,
    );

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
    const event = await this.getEventAndCheckOwner(
      eventId,
      organiserId,
      userRole,
    );

    if (event.status !== EventStatusEnum.PUBLISHED) {
      throw new ConflictException('Event must be published before opening');
    }

    event.status = EventStatusEnum.OPEN;
    await this.eventRepo.save(event);

    return { success: true };
  }

  async complete(eventId: string, organiserId: string, userRole?: string) {
    const event = await this.getEventAndCheckOwner(
      eventId,
      organiserId,
      userRole,
    );

    if (event.status !== EventStatusEnum.OPEN) {
      throw new ConflictException('Event must be open to be completed');
    }

    await this.dataSource.transaction(async (manager) => {
      event.status = EventStatusEnum.COMPLETED;
      event.completedAt = new Date();
      await manager.save(event);

      const paidParticipants = await manager.find(EventParticipant, {
        where: {
          eventId,
          status: ParticipantStatusEnum.REGISTERED,
          paymentStatus: PaymentStatusEnum.COMPLETED,
        },
      });

      const totalPoints = paidParticipants.reduce(
        (sum, p) => sum + p.amountPoints,
        0,
      );

      if (totalPoints > 0) {
        let commissionPercent = 5;
        try {
          const config = await this.adminConfigService.getConfig();
          commissionPercent = config.commissionPercent;
        } catch (e) {
          // Fallback
        }

        const commissionPoints = Math.round(
          (totalPoints * commissionPercent) / 100,
        );
        const payoutPoints = totalPoints - commissionPoints;

        if (payoutPoints > 0) {
          await this.pointsService.credit(
            {
              userId: event.creatorId,
              amountPoints: payoutPoints,
              type: PointsLedgerEntryTypeEnum.EVENT_PAYOUT,
              referenceType: 'evenement',
              referenceId: eventId,
            },
            manager,
          );
        }
        if (commissionPoints > 0) {
          await this.pointsService.recordCommission(
            {
              amountPoints: commissionPoints,
              type: PointsLedgerEntryTypeEnum.EVENT_COMMISSION,
              referenceType: 'evenement',
              referenceId: eventId,
            },
            manager,
          );
        }
      }

      // Distribute completion rewards to all registered participants
      if (event.rewardPoints > 0) {
        const registeredParticipants = await manager.find(EventParticipant, {
          where: {
            eventId,
            status: ParticipantStatusEnum.REGISTERED,
          },
        });

        for (const participant of registeredParticipants) {
          await this.pointsService.credit(
            {
              userId: participant.userId,
              amountPoints: event.rewardPoints,
              type: PointsLedgerEntryTypeEnum.EVENT_REWARD,
              referenceType: 'evenement',
              referenceId: eventId,
            },
            manager,
          );
        }
      }
    });

    return { success: true };
  }

  async cancel(
    eventId: string,
    organiserId: string,
    reason: string,
    userRole?: string,
  ) {
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Cancel reason cannot be empty');
    }

    const event = await this.getEventAndCheckOwner(
      eventId,
      organiserId,
      userRole,
    );

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

    await this.dataSource.transaction(async (manager) => {
      for (const p of participants) {
        const hoursSinceRegistration =
          (event.cancelledAt!.getTime() - p.registeredAt.getTime()) /
          (1000 * 60 * 60);
        if (hoursSinceRegistration <= event.refundDeadlineHours) {
          p.paymentStatus = PaymentStatusEnum.REFUNDED;
          p.refundedAt = new Date();
          await manager.save(p);

          await this.pointsService.credit(
            {
              userId: p.userId,
              amountPoints: p.amountPoints,
              type: PointsLedgerEntryTypeEnum.EVENT_REFUND,
              referenceType: 'evenement',
              referenceId: eventId,
            },
            manager,
          );
        }
      }
    });

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

  private async getEventAndCheckOwner(
    eventId: string,
    organiserId: string,
    userRole?: string,
  ) {
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
