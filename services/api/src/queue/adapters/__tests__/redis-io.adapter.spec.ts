import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from '../redis-io.adapter';

jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => {
      return {
        on: jest.fn((event, cb) => {
          if (event === 'ready') cb();
        }),
        duplicate: jest.fn().mockReturnValue({
          on: jest.fn((event, cb) => {
            if (event === 'ready') cb();
          }),
        }),
      };
    }),
  };
});

jest.mock('@socket.io/redis-adapter', () => {
  return {
    createAdapter: jest.fn().mockReturnValue('mocked-adapter'),
  };
});

describe('RedisIoAdapter', () => {
  let adapter: RedisIoAdapter;
  let mockApp: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('localhost'),
          },
        },
      ],
    }).compile();

    mockApp = {
      get: (token: any) => moduleRef.get(token),
      use: jest.fn(),
      init: jest.fn(),
      getHttpServer: jest.fn(),
    };

    adapter = new RedisIoAdapter(mockApp);
  });

  it('should connect to Redis and create adapter', async () => {
    await adapter.connectToRedis();
    expect((adapter as any).adapterConstructor).toBe('mocked-adapter');
  });

  it('should apply adapter to server', () => {
    (adapter as any).adapterConstructor = 'mocked-adapter';

    const mockServer = { adapter: jest.fn() };
    const createIOServerSpy = jest
      .spyOn(Object.getPrototypeOf(RedisIoAdapter.prototype), 'createIOServer')
      .mockReturnValue(mockServer);

    const result = adapter.createIOServer(3000);

    expect(createIOServerSpy).toHaveBeenCalledWith(3000, undefined);
    expect(mockServer.adapter).toHaveBeenCalledWith('mocked-adapter');
    expect(result).toBe(mockServer);
  });
});
