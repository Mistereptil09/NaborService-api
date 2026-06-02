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

@WebSocketGateway({ cors: true })
export class ListingsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, string>(); // userId -> socketId

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
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
      } else {
        client.disconnect();
      }
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === client.id) {
        this.userSockets.delete(userId);
        break;
      }
    }
  }

  @SubscribeMessage('join_listing')
  handleJoinListing(
    @MessageBody() data: { listingId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`listing:${data.listingId}`);
    return { event: 'joined', room: `listing:${data.listingId}` };
  }

  joinPartiesToRoom(
    listingId: string,
    providerId: string,
    requesterId: string,
  ) {
    if (!this.server) return;

    // Attempt joining by retrieving sockets
    const providerSocketId = this.userSockets.get(providerId);
    const requesterSocketId = this.userSockets.get(requesterId);

    if (providerSocketId) {
      const socket = this.server.sockets.sockets.get(providerSocketId);
      if (socket) socket.join(`listing:${listingId}`);
    }
    if (requesterSocketId) {
      const socket = this.server.sockets.sockets.get(requesterSocketId);
      if (socket) socket.join(`listing:${listingId}`);
    }
  }

  emitStatusChanged(listingId: string, status: string, updatedAt: Date) {
    if (this.server) {
      const payload = {
        listing_id: listingId,
        status,
        updated_at: updatedAt,
      };
      this.server
        .to(`listing:${listingId}`)
        .emit('listing:status_changed', payload);
    }
  }
}
