import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, Logger, UseFilters, UseGuards } from '@nestjs/common';
import { Server } from 'socket.io';
import { WsAuthService } from '../auth/ws-auth.service';
import type { AuthenticatedSocket } from '../auth/ws-auth.service';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { WsHttpExceptionFilter } from '../auth/filters/ws-exception.filter';
import { PollsService } from './polls.service';

@Injectable()
@UseGuards(WsJwtGuard)
@UseFilters(WsHttpExceptionFilter)
@WebSocketGateway({ cors: true, namespace: 'polls' })
export class PollsGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PollsGateway.name);

  constructor(
    private readonly wsAuthService: WsAuthService,
    private readonly pollsService: PollsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      this.wsAuthService.verify(client);
    } catch {
      client.disconnect();
    }
  }

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

  emitOptionAdded(
    pollId: string,
    option: { id: string; label: string; weight?: number },
  ) {
    this.server
      .to(`polls:poll:${pollId}`)
      .emit('poll:option_added', { poll_id: pollId, option });
  }
}
