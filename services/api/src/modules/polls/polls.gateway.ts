import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PollsService } from './polls.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@Injectable()
@WebSocketGateway({ cors: true, namespace: 'polls' })
export class PollsGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PollsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly pollsService: PollsService,
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
    } catch {
      client.disconnect();
    }
  }

  // ── Room management ─────────────────────────────────────

  @SubscribeMessage('join_poll')
  async handleJoinPoll(
    @MessageBody() data: { poll_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.userId) return;
    client.join(`polls:poll:${data.poll_id}`);
    return { event: 'joined', poll_id: data.poll_id };
  }

  @SubscribeMessage('leave_poll')
  handleLeavePoll(
    @MessageBody() data: { poll_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.leave(`polls:poll:${data.poll_id}`);
    return { event: 'left', poll_id: data.poll_id };
  }

  // ── Emit helpers (called by PollsService) ───────────────

  emitPollUpdated(pollId: string, results: any[]) {
    this.server
      .to(`polls:poll:${pollId}`)
      .emit('poll:updated', { poll_id: pollId, results });
  }

  emitPollClosed(pollId: string, finalResults: any[]) {
    this.server
      .to(`polls:poll:${pollId}`)
      .emit('poll:closed', { poll_id: pollId, final_results: finalResults });
  }

  emitOptionAdded(pollId: string, option: { id: string; label: string }) {
    this.server
      .to(`polls:poll:${pollId}`)
      .emit('poll:option_added', { poll_id: pollId, option });
  }
}
