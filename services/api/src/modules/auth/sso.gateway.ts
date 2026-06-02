import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class SsoGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const tokenUuid = client.handshake.query?.tokenUuid || client.handshake.auth?.tokenUuid;
    if (tokenUuid) {
      client.join(`sso:qr:${tokenUuid}`);
    }
  }

  @SubscribeMessage('join_sso')
  handleJoinSso(
    @MessageBody() data: { tokenUuid: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data && data.tokenUuid) {
      client.join(`sso:qr:${data.tokenUuid}`);
      return { event: 'joined', room: `sso:qr:${data.tokenUuid}` };
    }
  }

  emitQrValidated(tokenUuid: string, accessToken: string, refreshToken: string) {
    if (this.server) {
      this.server.to(`sso:qr:${tokenUuid}`).emit('sso:qr_validated', {
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }
  }
}
