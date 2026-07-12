import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { forwardRef, Inject, Injectable, UseGuards } from '@nestjs/common';
import { Server } from 'socket.io';
import { WsAuthService } from '../auth/ws-auth.service';
import type { AuthenticatedSocket } from '../auth/ws-auth.service';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { CallsService } from './calls.service';

interface CallSignalPayload {
  call_id: string;
  to_user_id: string;
  signal: { kind: 'offer' | 'answer' | 'ice-candidate'; data: unknown };
}

@Injectable()
@UseGuards(WsJwtGuard)
@WebSocketGateway({ cors: true, namespace: 'calls' })
export class CallsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly wsAuthService: WsAuthService,
    @Inject(forwardRef(() => CallsService))
    private readonly callsService: CallsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const { userId } = this.wsAuthService.verify(client);
      client.join(`user:${userId}`);
    } catch {
      client.disconnect();
    }
  }

  // ── Emit helpers (called by CallsService) ───────────────

  emitToUser(userId: string, event: string, data: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToCallRoom(callId: string, event: string, data: Record<string, unknown>) {
    this.server.to(`call:${callId}`).emit(event, data);
  }

  // ── Room management ─────────────────────────────────────

  @SubscribeMessage('join_call')
  async handleJoinCall(
    @MessageBody() data: { call_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const result = await this.callsService.joinCall(
      data.call_id,
      client.userId!,
    );
    client.join(`call:${data.call_id}`);
    this.server.to(`call:${data.call_id}`).emit('call:participant_joined', {
      call_id: data.call_id,
      user_id: client.userId,
    });
    // NOT { event, data }: @nestjs/platform-socket.io's IoAdapter treats any
    // handler return value with a truthy `.event` key as a fire-and-forget
    // socket.emit(response.event, response.data) instead of invoking the
    // caller's ack callback (see bindMessageHandlers in
    // node_modules/@nestjs/platform-socket.io/adapters/io-adapter.js) — so an
    // { event: 'joined', ... } return here would silently swallow the ack and
    // the client would never receive `participants`. `status` avoids the clash.
    return {
      status: 'joined',
      call_id: data.call_id,
      participants: result.participants,
    };
  }

  @SubscribeMessage('leave_call')
  async handleLeaveCall(
    @MessageBody() data: { call_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    await this.callsService.leaveCall(data.call_id, client.userId!);
    client.leave(`call:${data.call_id}`);
    this.server.to(`call:${data.call_id}`).emit('call:participant_left', {
      call_id: data.call_id,
      user_id: client.userId,
    });
    return { status: 'left', call_id: data.call_id };
  }

  // ── Call events ──────────────────────────────────────────

  @SubscribeMessage('call:decline')
  async handleDecline(
    @MessageBody() data: { call_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    await this.callsService.declineCall(data.call_id, client.userId!);
    this.server.to(`call:${data.call_id}`).emit('call:declined', {
      call_id: data.call_id,
      user_id: client.userId,
    });
    return { status: 'declined', call_id: data.call_id };
  }

  @SubscribeMessage('call:signal')
  async handleSignal(
    @MessageBody() data: CallSignalPayload,
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    await this.callsService.assertParticipants(data.call_id, [
      client.userId!,
      data.to_user_id,
    ]);
    this.server.to(`user:${data.to_user_id}`).emit('call:signal', {
      call_id: data.call_id,
      from_user_id: client.userId,
      signal: data.signal,
    });
  }

  @SubscribeMessage('call:media-state')
  async handleMediaState(
    @MessageBody()
    data: { call_id: string; muted: boolean; video_enabled: boolean },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.to(`call:${data.call_id}`).emit('call:media-state', {
      call_id: data.call_id,
      user_id: client.userId,
      muted: data.muted,
      video_enabled: data.video_enabled,
    });
  }
}
