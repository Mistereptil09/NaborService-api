import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException } from '@nestjs/common';
import { CallsGateway } from '../calls.gateway';
import { CallsService } from '../calls.service';
import { WsAuthService } from '../../auth/ws-auth.service';

describe('CallsGateway', () => {
  let gateway: CallsGateway;
  let callsService: any;
  let jwtService: any;

  const mockSocket = (token = 'valid-token') => ({
    handshake: { auth: { token }, query: {} },
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    userId: undefined as string | undefined,
  });

  beforeEach(async () => {
    jwtService = {
      verify: jest
        .fn()
        .mockReturnValue({ sub: 'u1', role: 'resident', locale: 'fr' }),
    };
    callsService = {
      joinCall: jest.fn().mockResolvedValue({
        participants: [{ user_id: 'u1', status: 'joined' }],
      }),
      leaveCall: jest.fn().mockResolvedValue({ resolved: false }),
      declineCall: jest.fn().mockResolvedValue({ resolved: false }),
      assertParticipants: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallsGateway,
        WsAuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: CallsService, useValue: callsService },
      ],
    }).compile();

    gateway = module.get(CallsGateway);
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
    };
  });

  it('should be defined', () => expect(gateway).toBeDefined());

  describe('handleConnection', () => {
    it('joins the personal room on a valid token', async () => {
      const client = mockSocket();
      await gateway.handleConnection(client as any);
      expect(client.userId).toBe('u1');
      expect(client.join).toHaveBeenCalledWith('user:u1');
    });

    it('disconnects on an invalid token', async () => {
      jwtService.verify.mockImplementationOnce(() => {
        throw new Error('invalid');
      });
      const client = mockSocket('bad');
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('join_call', () => {
    it('joins the call room and broadcasts call:participant_joined', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleJoinCall(
        { call_id: 'call1' },
        client as any,
      );

      expect(callsService.joinCall).toHaveBeenCalledWith('call1', 'u1');
      expect(client.join).toHaveBeenCalledWith('call:call1');
      expect(gateway.server.to).toHaveBeenCalledWith('call:call1');
      expect(result).not.toHaveProperty('event');
      expect(result.status).toBe('joined');
    });
  });

  describe('leave_call', () => {
    it('leaves the call room and broadcasts call:participant_left', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleLeaveCall(
        { call_id: 'call1' },
        client as any,
      );

      expect(callsService.leaveCall).toHaveBeenCalledWith('call1', 'u1');
      expect(client.leave).toHaveBeenCalledWith('call:call1');
      expect(result).not.toHaveProperty('event');
      expect(result.status).toBe('left');
    });
  });

  describe('call:signal', () => {
    it('rejects relaying a signal to a non-participant', async () => {
      callsService.assertParticipants.mockRejectedValueOnce(
        new ForbiddenException(),
      );
      const client = mockSocket();
      client.userId = 'u1';

      await expect(
        gateway.handleSignal(
          {
            call_id: 'call1',
            to_user_id: 'stranger',
            signal: { kind: 'offer', data: {} },
          },
          client as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('relays the signal to the recipient personal room', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      await gateway.handleSignal(
        {
          call_id: 'call1',
          to_user_id: 'u2',
          signal: { kind: 'offer', data: { sdp: 'x' } },
        },
        client as any,
      );

      expect(callsService.assertParticipants).toHaveBeenCalledWith('call1', [
        'u1',
        'u2',
      ]);
      expect(gateway.server.to).toHaveBeenCalledWith('user:u2');
    });
  });
});
