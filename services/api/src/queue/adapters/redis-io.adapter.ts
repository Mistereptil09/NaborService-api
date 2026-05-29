import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(private readonly appCtx: INestApplicationContext) {
    super(appCtx);
  }

  async connectToRedis(): Promise<void> {
    const configService = this.appCtx.get(ConfigService);
    const host = configService.get<string>('REDIS_HOST', 'localhost');
    const port = configService.get<number>('REDIS_PORT', 6379);
    const password = configService.get<string>('REDIS_PASSWORD');

    const pubClient = new Redis({ host, port, password });
    const subClient = pubClient.duplicate();

    await Promise.all([
      new Promise<void>((resolve) => pubClient.on('ready', resolve)),
      new Promise<void>((resolve) => subClient.on('ready', resolve)),
    ]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
