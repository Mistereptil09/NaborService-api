import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Server } from 'socket.io';
import { WsAuthService } from '../auth/ws-auth.service';
import type { AuthenticatedSocket } from '../auth/ws-auth.service';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { NotificationsService } from './notifications.service';

@Injectable()
@UseGuards(WsJwtGuard)
@WebSocketGateway({ cors: true, namespace: 'notifications' })
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly wsAuthService: WsAuthService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const { userId } = this.wsAuthService.verify(client);
      await client.join(`user:${userId}`);
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('notification:read')
  async handleRead(
    @MessageBody() data: { notification_id?: string; all?: boolean },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.userId) return;

    if (data.all) {
      await this.notificationsService.markAllAsRead(client.userId);
    } else if (data.notification_id) {
      await this.notificationsService.markAsRead(
        data.notification_id,
        client.userId,
      );
    }
  }

  // ── Emit helpers (called by NotificationsService) ──────

  emitToUser(userId: string, event: string, data: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
