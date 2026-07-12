import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsJwtGuard } from '../ws-jwt.guard';
import { WsAuthService } from '../../ws-auth.service';

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let wsAuthService: jest.Mocked<Pick<WsAuthService, 'verify'>>;

  const makeContext = (client: unknown): ExecutionContext =>
    ({
      switchToWs: () => ({ getClient: () => client }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    wsAuthService = { verify: jest.fn() };
    guard = new WsJwtGuard(wsAuthService as unknown as WsAuthService);
  });

  it('allows the call through when the token is valid', () => {
    wsAuthService.verify.mockReturnValue({ userId: 'u1' });
    const context = makeContext({ handshake: { auth: { token: 'valid' } } });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects an unauthenticated @SubscribeMessage call with a WsException', () => {
    wsAuthService.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });
    const context = makeContext({ handshake: { auth: {} } });

    expect(() => guard.canActivate(context)).toThrow(WsException);
  });
});
