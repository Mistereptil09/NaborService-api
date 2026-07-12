import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
}

/**
 * Shared JWT verification for Socket.IO gateways, extracted from the
 * inline try/catch block that used to be copy-pasted into every gateway's
 * handleConnection. Used both there (to reject the connection) and by
 * WsJwtGuard (to re-check on every @SubscribeMessage handler).
 */
@Injectable()
export class WsAuthService {
  constructor(private readonly jwtService: JwtService) {}

  verify(client: AuthenticatedSocket): { userId: string } {
    const token =
      (client.handshake.auth as any)?.token || client.handshake.query?.token;
    if (!token) {
      throw new UnauthorizedException('Token manquant');
    }
    const payload = this.jwtService.verify(token as string);
    client.userId = payload.sub;
    return { userId: payload.sub };
  }
}
