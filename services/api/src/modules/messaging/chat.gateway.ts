import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, Injectable, UseFilters, UseGuards } from '@nestjs/common';
import { Server } from 'socket.io';
import { REDIS_CLIENT } from '../../database/redis.module';
import Redis from 'ioredis';
import { WsAuthService } from '../auth/ws-auth.service';
import type { AuthenticatedSocket } from '../auth/ws-auth.service';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';
import { WsHttpExceptionFilter } from '../auth/filters/ws-exception.filter';
import { ChatMessageService } from './chat-message.service';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
@UseGuards(WsJwtGuard)
@UseFilters(WsHttpExceptionFilter)
@WebSocketGateway({
  cors: true,
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly wsAuthService: WsAuthService,
    private readonly chatMessageService: ChatMessageService,
    private readonly chatService: ChatService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const { userId } = this.wsAuthService.verify(client);
      client.join(`user:${userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    // Cleanup handled by Redis TTLs
  }

  @SubscribeMessage('message:send')
  async handleSend(
    @MessageBody() data: { group_id: string } & SendMessageDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const msg = await this.chatMessageService.sendMessage(
      data.group_id,
      client.userId!,
      {
        content: data.content,
        type: data.type,
        parent_message_id: data.parent_message_id,
      },
    );
    this.server.to(`chat:group:${data.group_id}`).emit('message:received', msg);
    return { status: 'sent', message: msg };
  }

  @SubscribeMessage('message:read')
  async handleRead(
    @MessageBody() data: { message_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const result = await this.chatMessageService.markRead(
      data.message_id,
      client.userId!,
    );
    this.server.emit('message:read_ack', result);
    return result;
  }

  @SubscribeMessage('message:edit')
  async handleEdit(
    @MessageBody() data: { message_id: string; new_content: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const msg = await this.chatMessageService.editMessage(
      data.message_id,
      client.userId!,
      data.new_content,
    );
    this.server.to(`chat:group:${msg.group_id}`).emit('message:edited', {
      message_id: data.message_id,
      new_content: data.new_content,
      edited_at: new Date().toISOString(),
    });
    return { status: 'edited', message_id: data.message_id };
  }

  @SubscribeMessage('message:delete')
  async handleDelete(
    @MessageBody() data: { message_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const result = await this.chatMessageService.softDeleteMessage(
      data.message_id,
      client.userId!,
    );
    this.server.emit('message:deleted', {
      message_id: data.message_id,
      deleted_at: new Date().toISOString(),
    });
    return result;
  }

  @SubscribeMessage('message:react')
  async handleReact(
    @MessageBody() data: { message_id: string; emoji: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const result = await this.chatMessageService.setReaction(
      data.message_id,
      client.userId!,
      data.emoji,
    );
    this.server
      .to(`chat:group:${result.group_id}`)
      .emit('message:reaction_updated', {
        message_id: result.message_id,
        reactions: result.reactions,
      });
    return {
      status: 'reacted',
      message_id: data.message_id,
      reactions: result.reactions,
    };
  }

  @SubscribeMessage('message:unreact')
  async handleUnreact(
    @MessageBody() data: { message_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const result = await this.chatMessageService.removeReaction(
      data.message_id,
      client.userId!,
    );
    this.server
      .to(`chat:group:${result.group_id}`)
      .emit('message:reaction_updated', {
        message_id: result.message_id,
        reactions: result.reactions,
      });
    return {
      status: 'unreacted',
      message_id: data.message_id,
      reactions: result.reactions,
    };
  }

  @SubscribeMessage('message:pin')
  async handlePin(
    @MessageBody() data: { message_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const msg = await this.chatMessageService.pinMessage(
      data.message_id,
      client.userId!,
    );
    this.server.to(`chat:group:${msg.group_id}`).emit('message:pinned', msg);
    return { status: 'pinned', message: msg };
  }

  @SubscribeMessage('message:unpin')
  async handleUnpin(
    @MessageBody() data: { message_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const msg = await this.chatMessageService.unpinMessage(
      data.message_id,
      client.userId!,
    );
    this.server.to(`chat:group:${msg.group_id}`).emit('message:unpinned', msg);
    return { status: 'unpinned', message: msg };
  }

  @SubscribeMessage('group:read')
  async handleGroupRead(
    @MessageBody() data: { group_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    await this.chatService.markGroupRead(data.group_id, client.userId!);
    return { status: 'read', group_id: data.group_id };
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @MessageBody() data: { group_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const key = `typing:${data.group_id}:${client.userId}`;
    await this.redis.set(key, '1', 'EX', 4);
    client.to(`chat:group:${data.group_id}`).emit('typing', {
      group_id: data.group_id,
      user_id: client.userId,
    });
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @MessageBody() data: { group_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const key = `typing:${data.group_id}:${client.userId}`;
    await this.redis.del(key);
    client.to(`chat:group:${data.group_id}`).emit('typing:stop', {
      group_id: data.group_id,
      user_id: client.userId,
    });
  }

  @SubscribeMessage('join_group')
  async handleJoinGroup(
    @MessageBody() data: { group_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.userId) return;
    const isMember = await this.chatService.isMember(
      data.group_id,
      client.userId,
    );
    if (isMember) {
      client.join(`chat:group:${data.group_id}`);
      return { status: 'joined', group_id: data.group_id };
    }
    return { status: 'forbidden', group_id: data.group_id };
  }

  @SubscribeMessage('leave_group')
  handleLeaveGroup(
    @MessageBody() data: { group_id: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.leave(`chat:group:${data.group_id}`);
    return { status: 'left', group_id: data.group_id };
  }

  emitToGroup(groupId: string, event: string, payload: unknown) {
    this.server.to(`chat:group:${groupId}`).emit(event, payload);
  }
}
