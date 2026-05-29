import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({ cors: true })
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  emitParticipantAdded(eventId: string, userId: string) {
    this.server.emit('event-participant-added', { eventId, userId });
  }

  emitRegistrationFailed(eventId: string, userId: string, reason: string) {
    this.server.emit('event-registration-failed', { eventId, userId, reason });
  }
}
