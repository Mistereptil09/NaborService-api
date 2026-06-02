import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';

@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, string>(); // userId -> socketId

  constructor(
    private readonly jwtService: JwtService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      if (userId) {
        this.userSockets.set(userId, client.id);
        this.redisClient
          .setex(`presence:${userId}`, 3600, 'online')
          .catch(() => {});
      } else {
        client.disconnect();
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === client.id) {
        this.userSockets.delete(userId);
        this.redisClient.del(`presence:${userId}`).catch(() => {});
        break;
      }
    }
  }

  @SubscribeMessage('join_event')
  handleJoinEvent(
    @MessageBody() data: { eventId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`event:${data.eventId}`);
    return { event: 'joined', room: `event:${data.eventId}` };
  }

  // Fallback helper
  private async notifyUser(userId: string, eventName: string, payload: any) {
    if (!this.server) return;
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(eventName, payload);
        return;
      }
    }

    // Offline fallback to email via Queue
    const isOnline = await this.redisClient.exists(`presence:${userId}`);
    if (!isOnline) {
      const user = await this.dataSource
        .getRepository(User)
        .findOne({ where: { id: userId } });
      if (user && user.email) {
        await this.emailQueue.add('send_email', {
          recipient: user.email,
          subject: `Notification: ${eventName}`,
          templateName: eventName,
          templateVariables: payload,
        });
      }
    }
  }

  emitRegistrationResult(userId: string, eventId: string, status: string) {
    this.notifyUser(userId, 'event:registration_result', {
      event_id: eventId,
      status,
    });
  }

  emitRegistrationFailed(eventId: string, userId: string, reason: string) {
    this.notifyUser(userId, 'event:registration_failed', {
      event_id: eventId,
      reason,
    });
  }

  emitParticipantAdded(eventId: string, userId: string) {
    if (this.server) {
      this.server.to(`event:${eventId}`).emit('event:participant_added', {
        event_id: eventId,
        user_id: userId,
      });
    }
  }

  emitPlaceAvailable(eventId: string) {
    if (this.server) {
      this.server
        .to(`event:${eventId}`)
        .emit('event:place_available', { event_id: eventId });
    }
  }

  emitWaitlistPromoted(userId: string, eventId: string) {
    this.notifyUser(userId, 'event:waitlist_promoted', {
      event_id: eventId,
      user_id: userId,
    });
  }

  emitEventCancelled(eventId: string, reason: string, cancelledAt: Date) {
    if (this.server) {
      this.server.to(`event:${eventId}`).emit('event:cancelled', {
        event_id: eventId,
        reason,
        cancelled_at: cancelledAt,
      });
    }
  }
}
