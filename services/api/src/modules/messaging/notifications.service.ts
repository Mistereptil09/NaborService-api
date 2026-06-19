import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly gateway: NotificationsGateway,
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

    return saved;
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
}
