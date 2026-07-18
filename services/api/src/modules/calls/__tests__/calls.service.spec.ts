import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { CallsService } from '../calls.service';
import {
  CallParticipantStatusEnum,
  CallStatusEnum,
  CallTypeEnum,
} from '../../../common/enums';

/** Minimal in-memory stand-in for the ioredis hash/string operations CallsService uses. */
class FakeRedis {
  private hashes = new Map<string, Record<string, string>>();
  private strings = new Map<string, string>();

  async hset(key: string, fieldOrObj: any, value?: string) {
    const hash = this.hashes.get(key) ?? {};
    if (typeof fieldOrObj === 'object') {
      Object.assign(hash, fieldOrObj);
    } else {
      hash[fieldOrObj] = value as string;
    }
    this.hashes.set(key, hash);
    return 1;
  }

  async hgetall(key: string) {
    return this.hashes.get(key) ?? {};
  }

  async expire() {
    return 1;
  }

  async del(...keys: string[]) {
    keys.forEach((k) => {
      this.hashes.delete(k);
      this.strings.delete(k);
    });
    return keys.length;
  }

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.strings.set(key, value);
    return 'OK';
  }
}

describe('CallsService', () => {
  let service: CallsService;
  let redis: FakeRedis;
  let callLogRepo: any;
  let callLogParticipantRepo: any;
  let timeoutQueue: any;
  let chatService: any;
  let chatMessageService: any;
  let chatGateway: any;
  let notificationsService: any;
  let userRepository: any;
  let userSocialService: any;
  let callsGateway: any;
  let configService: any;
  let httpRetryService: any;

  beforeEach(() => {
    redis = new FakeRedis();

    callLogRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
      findOne: jest.fn(),
    };
    callLogParticipantRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
      find: jest.fn(),
    };
    timeoutQueue = {
      add: jest.fn(),
      getJob: jest.fn().mockResolvedValue(null),
    };
    chatService = {
      isMember: jest.fn().mockResolvedValue(true),
      getMembers: jest
        .fn()
        .mockResolvedValue([{ userId: 'caller' }, { userId: 'callee' }]),
    };
    chatMessageService = {
      postSystemMessage: jest
        .fn()
        .mockResolvedValue({ id: 'm1', type: 'system' }),
    };
    chatGateway = {
      emitToGroup: jest.fn(),
    };
    notificationsService = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ firstName: 'Caller', lastName: 'Name' }),
    };
    userSocialService = {
      isBlocked: jest.fn().mockResolvedValue(false),
    };
    callsGateway = {
      emitToUser: jest.fn(),
      emitToCallRoom: jest.fn(),
    };
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    httpRetryService = {
      fetchWithRetry: jest.fn(),
    };

    service = new CallsService(
      callLogRepo,
      callLogParticipantRepo,
      redis as any,
      timeoutQueue,
      configService,
      httpRetryService,
      chatService,
      chatMessageService,
      chatGateway,
      notificationsService,
      userRepository,
      userSocialService,
      callsGateway,
    );
  });

  it('should be defined', () => expect(service).toBeDefined());

  // ── initiateCall ─────────────────────────────────────────

  describe('initiateCall', () => {
    it('rejects when caller is not a member of the group', async () => {
      chatService.isMember.mockResolvedValueOnce(false);
      await expect(
        service.initiateCall('caller', {
          group_id: 'g1',
          type: CallTypeEnum.VIDEO,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when caller has no other member to call', async () => {
      chatService.getMembers.mockResolvedValueOnce([{ userId: 'caller' }]);
      await expect(
        service.initiateCall('caller', {
          group_id: 'g1',
          type: CallTypeEnum.VIDEO,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when caller and callee have a block relationship', async () => {
      userSocialService.isBlocked.mockResolvedValueOnce(true);
      await expect(
        service.initiateCall('caller', {
          group_id: 'g1',
          type: CallTypeEnum.VIDEO,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates ringing call state, schedules timeout, and pushes call:incoming', async () => {
      const result = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });

      expect(result.status).toBe(CallStatusEnum.RINGING);
      expect(result.group_id).toBe('g1');
      expect(timeoutQueue.add).toHaveBeenCalledWith(
        'call-ringing-timeout',
        { callId: result.id },
        expect.objectContaining({ jobId: result.id }),
      );
      expect(callsGateway.emitToUser).toHaveBeenCalledWith(
        'callee',
        'call:incoming',
        expect.objectContaining({ call_id: result.id, from_user_id: 'caller' }),
      );

      const participants = await (service as any).getParticipants(result.id);
      expect(participants.caller.status).toBe(CallParticipantStatusEnum.JOINED);
      expect(participants.callee.status).toBe(
        CallParticipantStatusEnum.INVITED,
      );
    });
  });

  // ── joinCall / leaveCall / declineCall ──────────────────

  describe('joinCall', () => {
    it('rejects a user who is not a participant', async () => {
      const { id } = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });
      await expect(service.joinCall(id, 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('activates the call once a second participant joins', async () => {
      const { id } = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });
      await service.joinCall(id, 'callee');

      const meta = await (service as any).getMeta(id);
      expect(meta.status).toBe(CallStatusEnum.ACTIVE);
      expect(timeoutQueue.getJob).toHaveBeenCalled();
    });
  });

  describe('leaveCall / declineCall resolution', () => {
    it('resolves the call and writes a CallLog once everyone has left', async () => {
      const { id } = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });
      await service.joinCall(id, 'callee');

      await service.leaveCall(id, 'caller');
      const result = await service.leaveCall(id, 'callee');

      expect(result.resolved).toBe(true);
      expect(callLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ callId: id, status: CallStatusEnum.ENDED }),
      );
      expect(callLogParticipantRepo.save).toHaveBeenCalled();
      expect(callsGateway.emitToCallRoom).toHaveBeenCalledWith(
        id,
        'call:ended',
        { call_id: id, reason: 'ended' },
      );

      // Redis state is cleared after resolution.
      const meta = await (service as any).getMeta(id);
      expect(meta).toBeNull();
    });

    it('resolves as declined when the only invited participant declines', async () => {
      const { id } = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });
      const result = await service.declineCall(id, 'callee');

      expect(result.resolved).toBe(true);
      expect(callLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          callId: id,
          status: CallStatusEnum.DECLINED,
        }),
      );
    });
  });

  // ── handleRingingTimeout ─────────────────────────────────

  describe('handleRingingTimeout', () => {
    it('marks invited participants missed and resolves the call', async () => {
      const { id } = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });

      await service.handleRingingTimeout(id);

      expect(callLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ callId: id, status: CallStatusEnum.MISSED }),
      );
      const meta = await (service as any).getMeta(id);
      expect(meta).toBeNull();
    });

    it('is a no-op if the call already became active', async () => {
      const { id } = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });
      await service.joinCall(id, 'callee');
      callLogRepo.save.mockClear();

      await service.handleRingingTimeout(id);

      expect(callLogRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── call resolution: system message + notifications ─────

  describe('call resolution — system message and notifications', () => {
    it('missed call: posts a call_missed system message and notifies the missed participant', async () => {
      const { id } = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });

      await service.handleRingingTimeout(id);

      expect(chatMessageService.postSystemMessage).toHaveBeenCalledWith(
        'g1',
        'caller',
        'call_missed',
        expect.objectContaining({ callId: id, callType: CallTypeEnum.VIDEO }),
      );
      expect(chatGateway.emitToGroup).toHaveBeenCalledWith(
        'g1',
        'message:received',
        expect.objectContaining({ id: 'm1', type: 'system' }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: 'callee',
        type: 'missed_call',
        payload: expect.objectContaining({
          callId: id,
          callerId: 'caller',
          callType: CallTypeEnum.VIDEO,
        }),
      });
    });

    it('ended call: posts a call_ended system message with duration and notifies joined participants', async () => {
      const { id } = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });
      await service.joinCall(id, 'callee');

      await service.leaveCall(id, 'caller');
      await service.leaveCall(id, 'callee');

      expect(chatMessageService.postSystemMessage).toHaveBeenCalledWith(
        'g1',
        'caller',
        'call_ended',
        expect.objectContaining({
          callId: id,
          callType: CallTypeEnum.VIDEO,
          durationSeconds: expect.any(Number),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: 'caller',
        type: 'call_summary',
        payload: expect.objectContaining({ callId: id }),
      });
      expect(notificationsService.create).toHaveBeenCalledWith({
        userId: 'callee',
        type: 'call_summary',
        payload: expect.objectContaining({ callId: id }),
      });
    });

    it('a notification/system-message failure does not throw out of call resolution', async () => {
      chatMessageService.postSystemMessage.mockRejectedValueOnce(
        new Error('mongo down'),
      );
      notificationsService.create.mockRejectedValueOnce(new Error('db down'));

      const { id } = await service.initiateCall('caller', {
        group_id: 'g1',
        type: CallTypeEnum.VIDEO,
      });

      await expect(service.handleRingingTimeout(id)).resolves.toBeUndefined();
    });
  });

  // ── getIceServers ────────────────────────────────────────

  describe('getIceServers', () => {
    it('falls back to STUN-only when Cloudflare credentials are not configured', async () => {
      const result = await service.getIceServers();
      expect(result.flatMap((s) => s.urls)).toContain(
        'stun:stun.l.google.com:19302',
      );
      expect(httpRetryService.fetchWithRetry).not.toHaveBeenCalled();
    });

    it('fetches and caches Cloudflare TURN credentials (generate-ice-servers) when configured', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'CLOUDFLARE_TURN_KEY_ID'
          ? 'key-id'
          : key === 'CLOUDFLARE_TURN_API_TOKEN'
            ? 'api-token'
            : undefined,
      );
      httpRetryService.fetchWithRetry.mockResolvedValue({
        // Forme actuelle de l'API Cloudflare : `iceServers` est un tableau
        // (une entrée STUN, une entrée TURN avec identifiants).
        json: async () => ({
          iceServers: [
            { urls: ['stun:stun.cloudflare.com:3478'] },
            {
              urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
              username: 'u',
              credential: 'c',
            },
          ],
        }),
      });

      const result = await service.getIceServers();
      expect(httpRetryService.fetchWithRetry).toHaveBeenCalledWith(
        expect.stringContaining('/credentials/generate-ice-servers'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({ username: 'u', credential: 'c' });

      // Second call should hit the Redis cache, not Cloudflare again.
      httpRetryService.fetchWithRetry.mockClear();
      await service.getIceServers();
      expect(httpRetryService.fetchWithRetry).not.toHaveBeenCalled();
    });
  });
});
