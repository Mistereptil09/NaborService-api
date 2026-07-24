import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsAuthService, AuthenticatedSocket } from '../ws-auth.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly wsAuthService: WsAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();
    try {
      this.wsAuthService.verify(client);
      return true;
    } catch {
      throw new WsException('Non authentifié');
    }
  }
}
