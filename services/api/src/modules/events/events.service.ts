import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
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
import { PointsService } from '../points/points.service';
import { AdminConfigService } from '../admin/admin-config.service';
import { EventMediaService } from './event-media.service';

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
    private readonly eventMediaService: EventMediaService,
    @InjectQueue('event-register') private readonly registerQueue: Queue,
    @InjectQueue('waitlist-promote') private readonly promoteQueue: Queue,
    private readonly pointsService: PointsService,
    private readonly adminConfigService: AdminConfigService,
  ) {}

  async findAll(
    userId: string,
    query: ListEventsDto,
  ): Promise<{
    data: any[];
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

    const [events, total] = await qb.getManyAndCount();

    // Enrich events with point conversion and current user's swipe state
    const centsPerPoint = await this.getCentsPerPoint();
    const eventIds = events.map((e) => e.id);
    const swipes = eventIds.length
      ? await this.swipeRepo.find({
          where: { eventId: In(eventIds), userId },
        })
      : [];
    const swipeByEventId = new Map(
      swipes.map((s) => [s.eventId, s.direction]),
    );

    // Batch the cover lookup for the whole page (one Mongo query) so the feed
    // can show a thumbnail without a media call per card — mirrors listings.
    const covers = await this.eventMediaService.findCoverMediaIds(eventIds);

    const data = events.map((event) => ({
      ...event,
      costPoints: Math.floor(event.costCents / centsPerPoint),
      userSwipe: swipeByEventId.get(event.id) ?? null,
      coverMediaId: covers.get(event.id) ?? null,
    }));

    return { data, meta: { total, offset: query.offset, limit: query.limit } };
  }

  /**
   * Events the current user is involved in: either as creator or as a
   * registered/waitlisted participant (cancelled registrations excluded).
   * Mirrors listings' findUserOperations.
   */
  async findUserOperations(
    userId: string,
    query: ListEventsDto,
  ): Promise<{
    data: any[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const qb = this.eventRepo
      .createQueryBuilder('event')
      .leftJoin(
        EventParticipant,
        'participant',
        'participant.event_id = event.id AND participant.user_id = :userId AND participant.status != :cancelledStatus',
        { userId, cancelledStatus: ParticipantStatusEnum.CANCELLED },
      )
      .where('(event.creatorId = :userId OR participant.user_id IS NOT NULL)', {
        userId,
      });

    if (query.status) {
      qb.andWhere('event.status = :status', { status: query.status });
    }

    qb.orderBy('event.createdAt', 'DESC').skip(query.offset).take(query.limit);

    const [events, total] = await qb.getManyAndCount();

    const centsPerPoint = await this.getCentsPerPoint();
    const eventIds = events.map((e) => e.id);
    const swipes = eventIds.length
      ? await this.swipeRepo.find({
          where: { eventId: In(eventIds), userId },
        })
      : [];
    const swipeByEventId = new Map(
      swipes.map((s) => [s.eventId, s.direction]),
    );
    const covers = await this.eventMediaService.findCoverMediaIds(eventIds);

    const data = events.map((event) => ({
      ...event,
      costPoints: Math.floor(event.costCents / centsPerPoint),
      userSwipe: swipeByEventId.get(event.id) ?? null,
      coverMediaId: covers.get(event.id) ?? null,
    }));

    return { data, meta: { total, offset: query.offset, limit: query.limit } };
  }

  /**
   * Current user's registrations (registered or waitlisted, cancelled
   * excluded), each enriched with the event, its cover and the participation
   * status — feeds the "my registrations" tracking page.
   */
  async findUserRegistrations(
    userId: string,
    query: ListEventsDto,
  ): Promise<{
    data: any[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const [participations, total] = await this.participantRepo.findAndCount({
      where: { userId, status: Not(ParticipantStatusEnum.CANCELLED) },
      relations: ['event'],
      order: { registeredAt: 'DESC' },
      skip: query.offset,
      take: query.limit,
    });

    const centsPerPoint = await this.getCentsPerPoint();
    const eventIds = participations.map((p) => p.eventId);
    const covers = await this.eventMediaService.findCoverMediaIds(eventIds);

    const data = participations.map((p) => ({
      ...p.event,
      costPoints: Math.floor(p.event.costCents / centsPerPoint),
      coverMediaId: covers.get(p.eventId) ?? null,
      participationStatus: p.status,
      registeredAt: p.registeredAt,
    }));

    return { data, meta: { total, offset: query.offset, limit: query.limit } };
  }

  async create(userId: string, dto: CreateEventDto) {
    const event = this.eventRepo.create({
      ...dto,
      creatorId: userId,
      status: EventStatusEnum.DRAFT,
      costCents: dto.cost_cents ?? 0,
      rewardPoints: dto.reward_points ?? 0,
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
    const centsPerPoint = await this.getCentsPerPoint();
    return { ...event, costPoints: Math.floor(event.costCents / centsPerPoint) };
  }

  /**
   * Same as findOne but also enriched with the cover identifier, for the event
   * detail response. Kept separate so the many internal callers of findOne
   * (register, swipe, update…) don't incur the extra media lookup.
   * When `userId` is given, also exposes the caller's participation status so
   * the detail page survives a reload (registered / waitlisted / null).
   */
  async findOneWithCover(id: string, userId?: string) {
    const event = await this.findOne(id);
    const covers = await this.eventMediaService.findCoverMediaIds([id]);

    let participationStatus: ParticipantStatusEnum | null = null;
    if (userId) {
      const participation = await this.participantRepo.findOne({
        where: { eventId: id, userId, status: Not(ParticipantStatusEnum.CANCELLED) },
      });
      participationStatus = participation?.status ?? null;
    }

    return {
      ...event,
      coverMediaId: covers.get(id) ?? null,
      participationStatus,
    };
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
      ...(dto.reward_points !== undefined && { rewardPoints: dto.reward_points }),
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

    // Best-effort synchronous pre-validation so callers get immediate feedback
    // for the most common failure modes. The worker still performs the
    // authoritative checks under a pessimistic lock.
    const existing = await this.participantRepo.findOne({
      where: { eventId: id, userId },
    });
    if (existing?.status === ParticipantStatusEnum.REGISTERED) {
      throw new ConflictException('Already registered for this event');
    }

    if (event.maxParticipants) {
      const registeredCount = await this.participantRepo.count({
        where: { eventId: id, status: ParticipantStatusEnum.REGISTERED },
      });
      if (registeredCount >= event.maxParticipants) {
        throw new ConflictException('Event is full');
      }
    }

    if (event.costCents > 0) {
      const balance = await this.pointsService.getBalance(userId);
      const centsPerPoint = await this.getCentsPerPoint();
      const costPoints = Math.floor(event.costCents / centsPerPoint);
      if (balance < costPoints) {
        throw new ConflictException('Insufficient points for this event');
      }
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

  private async getCentsPerPoint(): Promise<number> {
    try {
      const config = await this.adminConfigService.getConfig();
      return config.centsPerPoint ?? 1;
    } catch {
      return 1;
    }
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
