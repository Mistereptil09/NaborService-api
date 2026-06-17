import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { REDIS_CLIENT } from '../../database/redis.module';
import Redis from 'ioredis';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@Injectable()
@WebSocketGateway({ cors: true })
export class PresenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PresenceGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        (client.handshake.auth as any)?.token ||
        client.handshake.query?.token;
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token as string);
      client.userId = payload.sub;

      // Update presence in Redis
      const presenceKey = `presence:${payload.sub}`;
      await this.redis.set(
        presenceKey,
        JSON.stringify({
          socket_id: client.id,
          connected_at: new Date().toISOString(),
          device: 'web',
        }),
        'EX',
        86400, // 24h
      );

      // Broadcast to all connected clients
      this.server.emit('presence:online', { user_id: payload.sub });
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (!client.userId) return;

    // Check if user has other active connections
    const sockets = await this.server.fetchSockets();
    const hasOtherConnection = sockets.some(
      (s) => (s as unknown as AuthenticatedSocket).userId === client.userId && s.id !== client.id,
    );

    if (!hasOtherConnection) {
      const presenceKey = `presence:${client.userId}`;
      await this.redis.del(presenceKey);
      this.server.emit('presence:offline', { user_id: client.userId });
    }
  }

  @SubscribeMessage('presence:query')
  async handlePresenceQuery(
    @MessageBody() data: { user_ids: string[] },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.userId) return { error: 'Not authenticated' };

    const results: { user_id: string; online: boolean }[] = [];
    const pipeline = this.redis.pipeline();

    for (const userId of data.user_ids) {
      pipeline.exists(`presence:${userId}`);
    }

    const responses = await pipeline.exec();
    if (responses) {
      for (let i = 0; i < data.user_ids.length; i++) {
        results.push({
          user_id: data.user_ids[i],
          online: responses[i]?.[1] === 1,
        });
      }
    }

    return { users: results };
  }
}
