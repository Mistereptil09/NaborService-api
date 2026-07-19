import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Evenement } from './entities/evenement.entity';
import { EventParticipant } from './entities/event-participant.entity';
import { EventSwipe } from './entities/event-swipe.entity';
import { EventStatusEnum, ParticipantStatusEnum } from '../../common/enums';
import { isModeratorOrAdmin } from '../../common/ownership';
import {
  CreateEventDto,
  UpdateEventDto,
  ListEventsDto,
} from './dto/event-routes.dtos';
import { ChatGroup } from '../messaging/entities/chat-group.entity';
import { UserBlock } from '../social/entities/user-block.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Evenement)
    private readonly eventRepo: Repository<Evenement>,
    @InjectRepository(EventParticipant)
    private readonly participantRepo: Repository<EventParticipant>,
    @InjectRepository(EventSwipe)
    private readonly swipeRepo: Repository<EventSwipe>,
    @InjectRepository(ChatGroup)
    private readonly chatGroupRepo: Repository<ChatGroup>,
    @InjectRepository(UserBlock)
    private readonly blockRepo: Repository<UserBlock>,
    @InjectQueue('event-register') private readonly registerQueue: Queue,
    @InjectQueue('waitlist-promote') private readonly promoteQueue: Queue,
  ) {}

  async findAll(
    userId: string,
    query: ListEventsDto,
  ): Promise<{
    data: Evenement[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const qb = this.eventRepo.createQueryBuilder('event');

    const blocks = await this.blockRepo.find({
      where: [{ blockerId: userId }, { blockedId: userId }],
    });
    const blockedUserIds = blocks.map((b) =>
      b.blockerId === userId ? b.blockedId : b.blockerId,
    );
    if (blockedUserIds.length > 0) {
      qb.andWhere('event.creatorId NOT IN (:...blockedUserIds)', {
        blockedUserIds,
      });
    }

    if (query.neighbourhood) {
      qb.andWhere('event.neighbourhoodId = :neighbourhood', {
        neighbourhood: query.neighbourhood,
      });
    }
    if (query.category) {
      qb.andWhere('event.categoryId = :category', { category: query.category });
    }
    if (query.status) {
      qb.andWhere('event.status = :status', { status: query.status });
    }

    qb.skip(query.offset).take(query.limit);

    if (query.upcoming) {
      // Keep only events yet to start (or with no scheduled date), soonest first.
      qb.andWhere('(event.startsAt IS NULL OR event.startsAt >= :now)', {
        now: new Date(),
      });
      qb.orderBy('event.startsAt', 'ASC');
    } else {
      qb.orderBy('event.createdAt', 'DESC');
    }

    const [data, total] = await qb.getManyAndCount();
    // { data, meta: { total, offset, limit } } — same pagination envelope
    // used across the rest of the API (incidents, listings, users social/discovery).
    return { data, meta: { total, offset: query.offset, limit: query.limit } };
  }

  async create(userId: string, dto: CreateEventDto) {
    const event = this.eventRepo.create({
      ...dto,
      creatorId: userId,
      status: EventStatusEnum.DRAFT,
      costCents: dto.cost_cents ?? 0,
      refundDeadlineHours: dto.refund_deadline_hours ?? 48,
      inviteCode: dto.invite_code || null,
      categoryId: dto.category_id || null,
      neighbourhoodId: dto.neighbourhood_id || null,
      startsAt: dto.starts_at ? new Date(dto.starts_at) : null,
      endsAt: dto.ends_at ? new Date(dto.ends_at) : null,
      maxParticipants: dto.max_participants || null,
    });
    return this.eventRepo.save(event);
  }

  async findOne(id: string) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateEventDto,
    userRole?: string,
  ) {
    const event = await this.findOne(id);

    if (event.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Only the owner can update this event');
    }

    if (
      event.status !== EventStatusEnum.DRAFT &&
      event.status !== EventStatusEnum.PUBLISHED
    ) {
      throw new ConflictException(
        'Event can only be updated in draft or published state',
      );
    }

    Object.assign(event, {
      ...dto,
      ...(dto.cost_cents !== undefined && { costCents: dto.cost_cents }),
      ...(dto.refund_deadline_hours !== undefined && {
        refundDeadlineHours: dto.refund_deadline_hours,
      }),
      ...(dto.invite_code !== undefined && {
        inviteCode: dto.invite_code || null,
      }),
      ...(dto.category_id !== undefined && {
        categoryId: dto.category_id || null,
      }),
      ...(dto.neighbourhood_id !== undefined && {
        neighbourhoodId: dto.neighbourhood_id || null,
      }),
      ...(dto.starts_at !== undefined && {
        startsAt: dto.starts_at ? new Date(dto.starts_at) : null,
      }),
      ...(dto.ends_at !== undefined && {
        endsAt: dto.ends_at ? new Date(dto.ends_at) : null,
      }),
      ...(dto.max_participants !== undefined && {
        maxParticipants: dto.max_participants || null,
      }),
    });

    event.updatedAt = new Date();
    return this.eventRepo.save(event);
  }

  async softDelete(userId: string, id: string, userRole?: string) {
    const event = await this.findOne(id);
    const isModOrAdmin = isModeratorOrAdmin(userRole);
    if (event.creatorId !== userId && !isModOrAdmin) {
      throw new ForbiddenException('Not authorized to delete this event');
    }
    await this.eventRepo.softDelete(id);
  }

  async register(id: string, userId: string) {
    const event = await this.findOne(id);
    if (event.status !== EventStatusEnum.OPEN) {
      throw new ConflictException('Event is not open for registration');
    }
    if (event.startsAt && event.startsAt.getTime() < Date.now()) {
      throw new ConflictException('Event has already started');
    }

    await this.registerQueue.add(
      'register',
      { eventId: id, userId },
      {
        jobId: `${id}_${userId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
      },
    );
    return { success: true };
  }

  async cancelRegistration(id: string, userId: string) {
    const participant = await this.participantRepo.findOne({
      where: { eventId: id, userId },
    });

    if (
      !participant ||
      participant.status === ParticipantStatusEnum.CANCELLED
    ) {
      throw new NotFoundException(
        'Registration not found or already cancelled',
      );
    }

    participant.status = ParticipantStatusEnum.CANCELLED;
    participant.cancelledAt = new Date();
    await this.participantRepo.save(participant);

    // Trigger waitlist promotion
    await this.promoteQueue.add('promote', { eventId: id });
  }

  async getParticipants(id: string, userId: string, userRole?: string) {
    const event = await this.findOne(id);
    if (event.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Only the owner can view participants');
    }

    return this.participantRepo.find({
      where: { eventId: id, status: ParticipantStatusEnum.REGISTERED },
      order: { registeredAt: 'ASC' },
      relations: ['user'],
    });
  }

  async getWaitlist(id: string, userId: string, userRole?: string) {
    const event = await this.findOne(id);
    if (event.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Only the owner can view the waitlist');
    }

    return this.participantRepo.find({
      where: { eventId: id, status: ParticipantStatusEnum.WAITLISTED },
      order: { registeredAt: 'ASC' },
      relations: ['user'],
    });
  }

  async swipe(userId: string, id: string, direction: string) {
    const event = await this.findOne(id);
    if (event.creatorId === userId) {
      throw new ConflictException('Cannot swipe on your own event');
    }

    let swipe = await this.swipeRepo.findOne({
      where: { eventId: id, userId },
    });
    if (swipe) {
      swipe.direction = direction as any;
      swipe.swipedAt = new Date();
    } else {
      swipe = this.swipeRepo.create({
        eventId: id,
        userId,
        direction: direction as any,
      });
    }
    await this.swipeRepo.save(swipe);
  }

  async getChatGroup(id: string, userId: string, userRole?: string) {
    const event = await this.findOne(id);
    if (!event.groupId) {
      throw new NotFoundException('No chat group for this event');
    }

    const isModOrAdmin = isModeratorOrAdmin(userRole);

    // Check if participant is registered, owner, or mod/admin
    if (event.creatorId !== userId && !isModOrAdmin) {
      const participant = await this.participantRepo.findOne({
        where: {
          eventId: id,
          userId,
          status: ParticipantStatusEnum.REGISTERED,
        },
      });
      if (!participant) {
        throw new ForbiddenException('Not a registered participant');
      }
    }

    return this.chatGroupRepo.findOne({ where: { id: event.groupId } });
  }
}
