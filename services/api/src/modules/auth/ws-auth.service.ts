import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
}

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
