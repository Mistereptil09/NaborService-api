import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { NOTIFICATION_ROUTING } from './notification-routing';
import { REDIS_CLIENT } from '../../database/redis.module';
import { User } from '../users/entities/user.entity';
import { EmailJobPayload } from '../../queue/interfaces/job-payloads';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly gateway: NotificationsGateway,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @InjectQueue('email')
    private readonly emailQueue: Queue,
  ) {}

  async create(params: {
    userId: string;
    type: NotificationType;
    payload?: Record<string, unknown>;
  }): Promise<Notification> {
    const notif = this.repo.create({
      userId: params.userId,
      type: params.type,
      payload: params.payload ?? null,
    });
    const saved = await this.repo.save(notif);

    // Emit real-time
    this.gateway.emitToUser(params.userId, 'notification:new', {
      id: saved.id,
      type: saved.type,
      payload: saved.payload,
      read: false,
      created_at: saved.createdAt,
    });

    // Relay by email when the recipient is offline. Best-effort: a relay
    // failure must never break in-app notification creation.
    await this.relayEmailIfOffline(params.userId, params.type, params.payload);

    return saved;
  }

  /**
   * Enqueues an email for `userId` only when they are offline (no Redis
   * presence). Opt-out and locale are applied downstream by the mail worker
   * via the payload's `essential` / `preferenceKey`.
   */
  private async relayEmailIfOffline(
    userId: string,
    type: NotificationType,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const isOnline = await this.redis.exists(`presence:${userId}`);
      if (isOnline) return;

      const route = NOTIFICATION_ROUTING[type];
      if (!route) return;

      const user = await this.userRepo.findOne({
        where: { id: userId },
        select: ['id', 'email', 'firstName'],
      });
      if (!user?.email) return;

      const emailPayload: EmailJobPayload = {
        recipient: user.email,
        subject: route.subject,
        templateName: route.templateName,
        // `firstName` must always be the RECIPIENT's name (used by the
        // template greeting). In-app payloads may carry the actor's name
        // instead (e.g. new_follower carries the follower's firstName), so
        // it is kept under `actorFirstName` and never greets the email.
        templateVariables: {
          ...payload,
          actorFirstName: payload?.firstName,
          firstName: user.firstName,
        },
        essential: route.essential,
        preferenceKey: route.preferenceKey,
      };
      await this.emailQueue.add('send-email', emailPayload);
    } catch (error: any) {
      this.logger.warn(
        `Email relay skipped for notification "${type}" to ${userId}: ${error?.message ?? error}`,
      );
    }
  }

  async getForUser(
    userId: string,
    offset: number = 0,
    limit: number = 50,
  ): Promise<{ notifications: Notification[]; unreadCount: number }> {
    const [notifications, unreadCount] = await Promise.all([
      this.repo.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        skip: offset,
        take: Math.min(limit, 100),
      }),
      this.repo.count({ where: { userId, read: false } }),
    ]);
    return { notifications, unreadCount };
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.repo.update({ id: notificationId, userId }, { read: true });
    this.gateway.emitToUser(userId, 'notification:read_ack', {
      notification_id: notificationId,
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.repo.update({ userId, read: false }, { read: true });
    this.gateway.emitToUser(userId, 'notification:read_ack', {
      all: true,
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, read: false } });
  }

  async delete(notificationId: string, userId: string): Promise<void> {
    await this.repo.delete({ id: notificationId, userId });
    this.gateway.emitToUser(userId, 'notification:deleted', {
      notification_id: notificationId,
    });
  }

  async deleteAll(userId: string): Promise<void> {
    await this.repo.delete({ userId });
    this.gateway.emitToUser(userId, 'notification:deleted', {
      all: true,
    });
  }
}
