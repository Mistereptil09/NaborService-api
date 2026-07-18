import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

/**
 * Applied at the gateway class level (@UseFilters(WsHttpExceptionFilter)).
 *
 * Nest's BaseWsExceptionFilter only preserves the real message for
 * WsException — any other thrown error (including the ForbiddenException /
 * NotFoundException / ConflictException our services already throw, shared
 * with the REST controllers) falls through to a generic "Internal server
 * error" on the `exception` event, silently discarding messages like
 * "Vous êtes en sourdine dans ce groupe". This unwraps HttpException's real
 * message before handing off; genuinely unexpected errors still go through
 * the base filter's generic handling (and still get logged there).
 */
@Catch()
export class WsHttpExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException) {
      const client = host.switchToWs().getClient<Socket>();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as any)?.message ?? exception.message);
      client.emit('exception', { status: 'error', message });
      return;
    }
    super.catch(exception, host);
  }
}
