import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsAuthService, AuthenticatedSocket } from '../ws-auth.service';

/**
 * Applied at the gateway class level (@UseGuards(WsJwtGuard)) so every
 * @SubscribeMessage handler re-verifies the JWT — including a token that
 * expired mid-connection, which handleConnection's one-time check never
 * catches. handleConnection still needs its own WsAuthService.verify() call
 * (guards don't run on connection lifecycle hooks), but both now share one
 * implementation instead of a duplicated inline block per gateway.
 */
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
