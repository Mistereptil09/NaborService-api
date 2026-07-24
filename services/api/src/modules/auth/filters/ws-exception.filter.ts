import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

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
