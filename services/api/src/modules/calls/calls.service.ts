import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { HttpRetryService } from '../../common/http-retry/http-retry.service';
import { ChatService } from '../messaging/chat.service';
import { ChatMessageService } from '../messaging/chat-message.service';
import { ChatGateway } from '../messaging/chat.gateway';
import { NotificationsService } from '../messaging/notifications.service';
import { User } from '../users/entities/user.entity';
import { UserSocialService } from '../users/user-social.service';
import { CallLog } from './entities/call-log.entity';
import { CallLogParticipant } from './entities/call-log-participant.entity';
import { InitiateCallDto } from './dto/initiate-call.dto';
import {
  CallParticipantStatusEnum,
  CallStatusEnum,
  CallTypeEnum,
} from '../../common/enums';
import { CallsGateway } from './calls.gateway';

interface ParticipantState {
  status: CallParticipantStatusEnum;
  joinedAt: string | null;
  leftAt: string | null;
}

interface CallMeta {
  groupId: string;
  type: CallTypeEnum;
  status: CallStatusEnum;
  initiatedBy: string;
  createdAt: string;
  startedAt: string;
}

/** Un RTCIceServer tel qu'attendu par le client (config RTCPeerConnection). */
export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

const LIVE_CALL_TTL_SECONDS = 6 * 60 * 60; // abandoned-call safety net
const RINGING_TIMEOUT_MS = 45 * 1000;
const TURN_CREDENTIAL_TTL_SECONDS = 23 * 60 * 60; // just under Cloudflare's 24h lifetime
const TURN_CACHE_KEY = 'turn:credentials';
// Repli STUN-only quand Cloudflare TURN n'est pas configuré. Note : ne permet
// PAS de traverser un NAT symétrique — un vrai serveur TURN reste nécessaire en prod.
const FALLBACK_ICE_SERVERS: IceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];

const RESOLVED_STATUSES = new Set([
  CallStatusEnum.ENDED,
  CallStatusEnum.MISSED,
  CallStatusEnum.DECLINED,
]);

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @InjectRepository(CallLog)
    private readonly callLogRepo: Repository<CallLog>,
    @InjectRepository(CallLogParticipant)
    private readonly callLogParticipantRepo: Repository<CallLogParticipant>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue('call-timeout') private readonly timeoutQueue: Queue,
    private readonly configService: ConfigService,
    private readonly httpRetryService: HttpRetryService,
    private readonly chatService: ChatService,
    private readonly chatMessageService: ChatMessageService,
    private readonly chatGateway: ChatGateway,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly userSocialService: UserSocialService,
    @Inject(forwardRef(() => CallsGateway))
    private readonly callsGateway: CallsGateway,
  ) {}

  // ── Redis key helpers ───────────────────────────────────

  private metaKey(callId: string): string {
    return `call:${callId}:meta`;
  }

  private participantsKey(callId: string): string {
    return `call:${callId}:participants`;
  }

  private resolvingKey(callId: string): string {
    return `call:${callId}:resolving`;
  }

  private async touchTtl(callId: string): Promise<void> {
    await Promise.all([
      this.redis.expire(this.metaKey(callId), LIVE_CALL_TTL_SECONDS),
      this.redis.expire(this.participantsKey(callId), LIVE_CALL_TTL_SECONDS),
    ]);
  }

  private async getMeta(callId: string): Promise<CallMeta | null> {
    const data = await this.redis.hgetall(this.metaKey(callId));
    if (!data || Object.keys(data).length === 0) return null;
    return data as unknown as CallMeta;
  }

  private async getParticipants(
    callId: string,
  ): Promise<Record<string, ParticipantState>> {
    const raw = await this.redis.hgetall(this.participantsKey(callId));
    const result: Record<string, ParticipantState> = {};
    for (const [userId, json] of Object.entries(raw)) {
      result[userId] = JSON.parse(json);
    }
    return result;
  }

  private async setParticipant(
    callId: string,
    userId: string,
    state: ParticipantState,
  ): Promise<void> {
    await this.redis.hset(
      this.participantsKey(callId),
      userId,
      JSON.stringify(state),
    );
  }

  private async cancelTimeoutJob(callId: string): Promise<void> {
    const job = await this.timeoutQueue.getJob(callId);
    if (job) await job.remove().catch(() => {});
  }

  // ── ICE / TURN (Cloudflare Calls) ───────────────────────

  async getIceServers(): Promise<IceServer[]> {
    const cached = await this.redis.get(TURN_CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const keyId = this.configService.get<string>('CLOUDFLARE_TURN_KEY_ID');
    const apiToken = this.configService.get<string>(
      'CLOUDFLARE_TURN_API_TOKEN',
    );
    if (!keyId || !apiToken) {
      this.logger.warn(
        'CLOUDFLARE_TURN_KEY_ID/CLOUDFLARE_TURN_API_TOKEN not configured — falling back to STUN-only ICE servers',
      );
      return FALLBACK_ICE_SERVERS;
    }

    try {
      // https://developers.cloudflare.com/realtime/turn/generate-credentials/
      // POST .../credentials/generate-ice-servers → { iceServers: RTCIceServer[] }
      // (une entrée STUN + une entrée TURN avec username/credential éphémères).
      const response = await this.httpRetryService.fetchWithRetry(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }),
        },
      );
      const body = (await response.json()) as { iceServers: IceServer[] };
      const iceServers = body.iceServers;

      await this.redis.set(
        TURN_CACHE_KEY,
        JSON.stringify(iceServers),
        'EX',
        TURN_CREDENTIAL_TTL_SECONDS,
      );
      return iceServers;
    } catch (error: any) {
      this.logger.warn(
        `Cloudflare TURN credential generation failed, falling back to STUN-only: ${error?.message ?? error}`,
      );
      return FALLBACK_ICE_SERVERS;
    }
  }

  // ── Lifecycle ────────────────────────────────────────────

  async initiateCall(callerId: string, dto: InitiateCallDto) {
    const isMember = await this.chatService.isMember(dto.group_id, callerId);
    if (!isMember) {
      throw new ForbiddenException("Vous n'êtes pas membre de ce groupe");
    }

    const members = await this.chatService.getMembers(dto.group_id);
    const otherMemberIds = members
      .map((m) => m.userId)
      .filter((id) => id !== callerId);
    if (otherMemberIds.length === 0) {
      throw new BadRequestException('Aucun autre membre à appeler');
    }

    for (const memberId of otherMemberIds) {
      if (await this.userSocialService.isBlocked(callerId, memberId)) {
        throw new ForbiddenException('Action non autorisée');
      }
    }

    const callId = randomUUID();
    const now = new Date().toISOString();

    await this.redis.hset(this.metaKey(callId), {
      groupId: dto.group_id,
      type: dto.type,
      status: CallStatusEnum.RINGING,
      initiatedBy: callerId,
      createdAt: now,
      startedAt: '',
    });

    await this.setParticipant(callId, callerId, {
      status: CallParticipantStatusEnum.JOINED,
      joinedAt: now,
      leftAt: null,
    });
    for (const memberId of otherMemberIds) {
      await this.setParticipant(callId, memberId, {
        status: CallParticipantStatusEnum.INVITED,
        joinedAt: null,
        leftAt: null,
      });
    }
    await this.touchTtl(callId);

    await this.timeoutQueue.add(
      'call-ringing-timeout',
      { callId },
      { delay: RINGING_TIMEOUT_MS, jobId: callId },
    );

    const iceServers = await this.getIceServers();

    for (const memberId of otherMemberIds) {
      this.callsGateway.emitToUser(memberId, 'call:incoming', {
        call_id: callId,
        group_id: dto.group_id,
        type: dto.type,
        from_user_id: callerId,
        ice_servers: iceServers,
      });
    }

    return {
      id: callId,
      group_id: dto.group_id,
      type: dto.type,
      status: CallStatusEnum.RINGING,
      initiated_by: callerId,
      ice_servers: iceServers,
      created_at: now,
    };
  }

  async getCallState(callId: string, userId: string) {
    const meta = await this.getMeta(callId);
    if (meta) {
      const participants = await this.getParticipants(callId);
      if (!participants[userId]) {
        throw new ForbiddenException('Vous ne participez pas à cet appel');
      }
      return {
        id: callId,
        group_id: meta.groupId,
        type: meta.type,
        status: meta.status,
        started_at: meta.startedAt || null,
        ended_at: null,
        participants: Object.entries(participants).map(([id, p]) => ({
          user_id: id,
          status: p.status,
          joined_at: p.joinedAt,
          left_at: p.leftAt,
        })),
      };
    }

    const log = await this.callLogRepo.findOne({ where: { callId } });
    if (!log) throw new NotFoundException('Appel introuvable');
    const participantRows = await this.callLogParticipantRepo.find({
      where: { callId },
    });
    if (!participantRows.some((p) => p.userId === userId)) {
      throw new ForbiddenException('Vous ne participez pas à cet appel');
    }
    return {
      id: log.callId,
      group_id: log.groupId,
      type: log.type,
      status: log.status,
      started_at: log.startedAt,
      ended_at: log.endedAt,
      participants: participantRows.map((p) => ({
        user_id: p.userId,
        status: p.status,
        joined_at: p.joinedAt,
        left_at: p.leftAt,
      })),
    };
  }

  async assertParticipants(callId: string, userIds: string[]): Promise<void> {
    const participants = await this.getParticipants(callId);
    for (const id of userIds) {
      if (!participants[id]) {
        throw new ForbiddenException('Utilisateur non participant à cet appel');
      }
    }
  }

  async joinCall(
    callId: string,
    userId: string,
  ): Promise<{ participants: { user_id: string; status: string }[] }> {
    const participants = await this.getParticipants(callId);
    const p = participants[userId];
    if (!p) {
      throw new ForbiddenException('Vous ne participez pas à cet appel');
    }
    if (
      p.status === CallParticipantStatusEnum.DECLINED ||
      p.status === CallParticipantStatusEnum.LEFT
    ) {
      throw new ForbiddenException('Vous ne pouvez plus rejoindre cet appel');
    }

    const now = new Date().toISOString();
    p.status = CallParticipantStatusEnum.JOINED;
    p.joinedAt = now;
    participants[userId] = p;
    await this.setParticipant(callId, userId, p);

    const joinedCount = Object.values(participants).filter(
      (x) => x.status === CallParticipantStatusEnum.JOINED,
    ).length;
    const meta = await this.getMeta(callId);
    if (meta && meta.status === CallStatusEnum.RINGING && joinedCount >= 2) {
      await this.redis.hset(this.metaKey(callId), {
        status: CallStatusEnum.ACTIVE,
        startedAt: now,
      });
      await this.cancelTimeoutJob(callId);
    }
    await this.touchTtl(callId);

    return {
      participants: Object.entries(participants).map(([id, s]) => ({
        user_id: id,
        status: s.status,
      })),
    };
  }

  async leaveCall(
    callId: string,
    userId: string,
  ): Promise<{ resolved: boolean }> {
    const participants = await this.getParticipants(callId);
    const p = participants[userId];
    if (!p) return { resolved: false };

    const now = new Date().toISOString();
    p.status = CallParticipantStatusEnum.LEFT;
    p.leftAt = now;
    participants[userId] = p;
    await this.setParticipant(callId, userId, p);

    const stillJoined = Object.values(participants).some(
      (x) => x.status === CallParticipantStatusEnum.JOINED,
    );
    if (!stillJoined) {
      await this.cancelTimeoutJob(callId);
      await this.resolveCall(callId, CallStatusEnum.ENDED);
      return { resolved: true };
    }
    await this.touchTtl(callId);
    return { resolved: false };
  }

  async declineCall(
    callId: string,
    userId: string,
  ): Promise<{ resolved: boolean }> {
    const meta = await this.getMeta(callId);
    const participants = await this.getParticipants(callId);
    const p = participants[userId];
    if (!p) return { resolved: false };

    p.status = CallParticipantStatusEnum.DECLINED;
    participants[userId] = p;
    await this.setParticipant(callId, userId, p);

    // The initiator auto-joins at creation and stays 'joined' even while
    // everyone else is still ringing — exclude them so a callee declining
    // a 1:1 call resolves it instead of leaving it stuck ringing forever.
    const others = Object.entries(participants).filter(
      ([id]) => id !== meta?.initiatedBy,
    );
    const anyoneStillInvited = others.some(
      ([, x]) => x.status === CallParticipantStatusEnum.INVITED,
    );
    const anyoneJoined = others.some(
      ([, x]) => x.status === CallParticipantStatusEnum.JOINED,
    );
    if (!anyoneStillInvited && !anyoneJoined) {
      await this.cancelTimeoutJob(callId);
      await this.resolveCall(callId, CallStatusEnum.DECLINED);
      return { resolved: true };
    }
    await this.touchTtl(callId);
    return { resolved: false };
  }

  async endCallPrivileged(callId: string, userId: string) {
    const meta = await this.getMeta(callId);
    if (!meta) throw new NotFoundException('Appel introuvable ou déjà terminé');
    const participants = await this.getParticipants(callId);
    const participantIds = Object.keys(participants);
    const isInitiator = meta.initiatedBy === userId;
    const isOneOnOne =
      participantIds.length === 2 && participantIds.includes(userId);
    if (!isInitiator && !isOneOnOne) {
      throw new ForbiddenException('Vous ne pouvez pas terminer cet appel');
    }

    await this.cancelTimeoutJob(callId);
    const endedAt = new Date().toISOString();
    await this.resolveCall(callId, CallStatusEnum.ENDED);
    return { id: callId, status: CallStatusEnum.ENDED, ended_at: endedAt };
  }

  /** Called by CallTimeoutWorker when the ringing-timeout job fires. */
  async handleRingingTimeout(callId: string): Promise<void> {
    const meta = await this.getMeta(callId);
    if (!meta || meta.status !== CallStatusEnum.RINGING) return; // already resolved

    const participants = await this.getParticipants(callId);
    for (const [userId, p] of Object.entries(participants)) {
      if (p.status === CallParticipantStatusEnum.INVITED) {
        p.status = CallParticipantStatusEnum.MISSED;
        await this.setParticipant(callId, userId, p);
      }
    }
    await this.resolveCall(callId, CallStatusEnum.MISSED);
  }

  /**
   * Shared resolution path for every way a call can end: explicit end,
   * everyone leaving, everyone declining, or the ringing timeout firing.
   * Snapshots the live Redis state into a durable CallLog, then clears it.
   */
  private async resolveCall(
    callId: string,
    status:
      | CallStatusEnum.ENDED
      | CallStatusEnum.MISSED
      | CallStatusEnum.DECLINED,
  ): Promise<void> {
    if (!RESOLVED_STATUSES.has(status)) return;

    // Plusieurs chemins peuvent tenter de résoudre le même appel à quelques
    // ms d'écart (ex. côté 1:1, l'appelant raccroche : `endCallPrivileged`
    // (HTTP) ET l'émission socket `leave_call` du même client démarrent en
    // parallèle ; ou les deux participants raccrochent presque en même temps).
    // Sans verrou, chacun lirait `meta` non-nul avant que l'autre n'ait eu le
    // temps de le supprimer (le `del` n'intervient qu'après plusieurs await),
    // doublant le CallLog, le message système et les notifications. Ce verrou
    // atomique (NX) garantit qu'un seul appelant gagne la course.
    const claimed = await this.redis.set(
      this.resolvingKey(callId),
      '1',
      'EX',
      30,
      'NX',
    );
    if (claimed !== 'OK') return;

    const meta = await this.getMeta(callId);
    if (!meta) return; // already resolved by a concurrent path
    const participants = await this.getParticipants(callId);
    const now = new Date();

    const log = this.callLogRepo.create({
      callId,
      groupId: meta.groupId,
      type: meta.type,
      status,
      initiatedBy: meta.initiatedBy,
      startedAt: meta.startedAt ? new Date(meta.startedAt) : null,
      endedAt: now,
    });
    await this.callLogRepo.save(log);

    const participantRows = Object.entries(participants).map(([userId, p]) =>
      this.callLogParticipantRepo.create({
        callId,
        userId,
        status:
          p.status === CallParticipantStatusEnum.INVITED
            ? CallParticipantStatusEnum.MISSED
            : p.status,
        joinedAt: p.joinedAt ? new Date(p.joinedAt) : null,
        leftAt:
          p.status === CallParticipantStatusEnum.JOINED
            ? now
            : p.leftAt
              ? new Date(p.leftAt)
              : null,
      }),
    );
    if (participantRows.length) {
      await this.callLogParticipantRepo.save(participantRows);
    }

    await this.redis.del(
      this.metaKey(callId),
      this.participantsKey(callId),
      this.resolvingKey(callId),
    );

    const reason =
      status === CallStatusEnum.ENDED
        ? 'ended'
        : status === CallStatusEnum.MISSED
          ? 'missed'
          : 'declined';
    this.callsGateway.emitToCallRoom(callId, 'call:ended', {
      call_id: callId,
      reason,
    });

    await this.notifyCallResolved(log, participantRows);
  }

  /**
   * Best-effort: posts a system message into the call's group conversation
   * and notifies affected participants. Never throws — a failure here must
   * not undo the call-teardown work already committed above.
   */
  private async notifyCallResolved(
    log: CallLog,
    participantRows: CallLogParticipant[],
  ): Promise<void> {
    const durationSeconds =
      log.status === CallStatusEnum.ENDED && log.startedAt && log.endedAt
        ? Math.round(
            (log.endedAt.getTime() - log.startedAt.getTime()) / 1000,
          )
        : undefined;

    const event =
      log.status === CallStatusEnum.MISSED
        ? 'call_missed'
        : log.status === CallStatusEnum.DECLINED
          ? 'call_declined'
          : 'call_ended';

    try {
      const message = await this.chatMessageService.postSystemMessage(
        log.groupId,
        log.initiatedBy,
        event,
        { callId: log.callId, callType: log.type, durationSeconds },
      );
      this.chatGateway.emitToGroup(log.groupId, 'message:received', message);
    } catch (error: any) {
      this.logger.warn(
        `Failed to post call system message for call ${log.callId}: ${error?.message ?? error}`,
      );
    }

    if (log.status === CallStatusEnum.MISSED) {
      const callerName = await this.resolveDisplayName(log.initiatedBy);
      for (const p of participantRows) {
        if (p.status !== CallParticipantStatusEnum.MISSED) continue;
        await this.safeNotify(p.userId, 'missed_call', {
          callId: log.callId,
          groupId: log.groupId,
          callerId: log.initiatedBy,
          callerName,
          callType: log.type,
        });
      }
    } else if (log.status === CallStatusEnum.ENDED) {
      // Les appels sont strictement à deux — l'autre participant est donc
      // toujours désignable sans ambiguïté.
      const nameCache = new Map<string, string | null>();
      const resolveCachedName = async (userId: string) => {
        if (!nameCache.has(userId)) {
          nameCache.set(userId, await this.resolveDisplayName(userId));
        }
        return nameCache.get(userId) ?? null;
      };

      for (const p of participantRows) {
        if (!p.joinedAt) continue;
        const other = participantRows.find((o) => o.userId !== p.userId) ?? null;
        const otherName = other ? await resolveCachedName(other.userId) : null;
        await this.safeNotify(p.userId, 'call_summary', {
          callId: log.callId,
          groupId: log.groupId,
          callType: log.type,
          durationSeconds,
          otherName,
        });
      }
    }
  }

  private async resolveDisplayName(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['firstName', 'lastName'],
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : null;
  }

  private async safeNotify(
    userId: string,
    type: 'missed_call' | 'call_summary',
    payload: Record<string, any>,
  ): Promise<void> {
    try {
      await this.notificationsService.create({ userId, type, payload });
    } catch (error: any) {
      this.logger.warn(
        `Failed to create "${type}" notification for ${userId}: ${error?.message ?? error}`,
      );
    }
  }
}
