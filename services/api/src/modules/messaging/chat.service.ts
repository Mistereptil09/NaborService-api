import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { REDIS_CLIENT } from '../../database/redis.module';
import Redis from 'ioredis';
import { ChatGroup } from './entities/chat-group.entity';
import { UsersInGroup } from './entities/users-in-group.entity';
import { GroupRoleEnum, ChatGroupTypeEnum } from '../../common/enums';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatGroup)
    private readonly groupRepo: Repository<ChatGroup>,
    @InjectRepository(UsersInGroup)
    private readonly uigRepo: Repository<UsersInGroup>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Groups ──────────────────────────────────────────────

  async getUserGroups(userId: string) {
    const memberships = await this.uigRepo.find({
      where: { userId, leftAt: IsNull(), kickedAt: IsNull() },
      relations: ['group'],
    });
    return memberships
      .map((m) => m.group)
      .filter((g) => g && g.deletedAt === null);
  }

  async createGroup(creatorId: string, dto: CreateGroupDto) {
    const group = this.groupRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      createdBy: creatorId,
      type: ChatGroupTypeEnum.GROUP_CHAT,
    });
    const saved = await this.groupRepo.save(group);

    // Creator is admin
    await this.uigRepo.save(
      this.uigRepo.create({
        userId: creatorId,
        groupId: saved.id,
        roleInGroup: GroupRoleEnum.ADMIN,
      }),
    );

    // Add initial members
    if (dto.memberIds?.length) {
      const members = dto.memberIds
        .filter((id) => id !== creatorId)
        .map((userId) =>
          this.uigRepo.create({
            userId,
            groupId: saved.id,
            roleInGroup: GroupRoleEnum.MESSAGE,
          }),
        );
      if (members.length > 0) await this.uigRepo.save(members);
    }

    return saved;
  }

  async getGroupDetail(groupId: string) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || group.deletedAt) throw new NotFoundException('Groupe introuvable');
    return group;
  }

  async updateGroup(groupId: string, userId: string, dto: UpdateGroupDto) {
    await this.requireRole(groupId, userId, [GroupRoleEnum.ACTIONS, GroupRoleEnum.ADMIN]);
    const group = await this.getGroupDetail(groupId);
    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description;
    return this.groupRepo.save(group);
  }

  async softDeleteGroup(groupId: string, userId: string) {
    await this.requireRole(groupId, userId, [GroupRoleEnum.ADMIN]);
    const group = await this.getGroupDetail(groupId);
    group.deletedAt = new Date();
    return this.groupRepo.save(group);
  }

  // ── Members ─────────────────────────────────────────────

  async getMembers(groupId: string) {
    await this.getGroupDetail(groupId); // ensure exists
    return this.uigRepo.find({
      where: { groupId, leftAt: IsNull(), kickedAt: IsNull() },
      relations: ['user'],
    });
  }

  async addMember(groupId: string, newUserId: string, inviterId: string) {
    await this.requireRole(groupId, inviterId, [GroupRoleEnum.ACTIONS, GroupRoleEnum.ADMIN]);
    const existing = await this.uigRepo.findOne({
      where: { groupId, userId: newUserId },
    });
    if (existing && !existing.leftAt && !existing.kickedAt) {
      return existing; // already active member
    }
    if (existing) {
      // Re-join: reset left/kicked
      existing.leftAt = null;
      existing.kickedAt = null;
      existing.roleInGroup = GroupRoleEnum.MESSAGE;
      return this.uigRepo.save(existing);
    }
    return this.uigRepo.save(
      this.uigRepo.create({
        userId: newUserId,
        groupId,
        roleInGroup: GroupRoleEnum.MESSAGE,
      }),
    );
  }

  async removeMember(groupId: string, targetUserId: string, removerId: string) {
    const isSelf = targetUserId === removerId;
    if (!isSelf) {
      await this.requireRole(groupId, removerId, [GroupRoleEnum.ADMIN]);
    }
    const membership = await this.getMembership(groupId, targetUserId);
    if (isSelf) {
      membership.leftAt = new Date();
    } else {
      membership.kickedAt = new Date();
    }
    return this.uigRepo.save(membership);
  }

  async changeRole(groupId: string, targetUserId: string, newRole: GroupRoleEnum, adminId: string) {
    await this.requireRole(groupId, adminId, [GroupRoleEnum.ADMIN]);
    const membership = await this.getMembership(groupId, targetUserId);
    membership.roleInGroup = newRole;
    return this.uigRepo.save(membership);
  }

  // ── Mute ────────────────────────────────────────────────

  async mute(groupId: string, userId: string, durationMinutes?: number) {
    await this.getMembership(groupId, userId);
    const mutedUntil = durationMinutes
      ? new Date(Date.now() + durationMinutes * 60 * 1000)
      : new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // effectively permanent

    await this.uigRepo.update(
      { userId, groupId },
      { isMuted: true, mutedUntil },
    );

    // Redis TTL for fast send-time check
    const ttl = durationMinutes ? durationMinutes * 60 : 86400 * 365;
    await this.redis.set(`mute:${userId}:${groupId}`, '1', 'EX', ttl);
    return { muted_until: mutedUntil };
  }

  async unmute(groupId: string, userId: string) {
    await this.getMembership(groupId, userId);
    await this.uigRepo.update(
      { userId, groupId },
      { isMuted: false, mutedUntil: null },
    );
    await this.redis.del(`mute:${userId}:${groupId}`);
    return { muted: false };
  }

  async isMuted(groupId: string, userId: string): Promise<boolean> {
    const exists = await this.redis.get(`mute:${userId}:${groupId}`);
    return exists !== null;
  }

  // ── Permission helpers ──────────────────────────────────

  async isMember(groupId: string, userId: string): Promise<boolean> {
    const m = await this.uigRepo.findOne({
      where: { groupId, userId, leftAt: IsNull(), kickedAt: IsNull() },
    });
    return m !== null;
  }

  private async getMembership(groupId: string, userId: string): Promise<UsersInGroup> {
    const m = await this.uigRepo.findOne({
      where: { groupId, userId, leftAt: IsNull(), kickedAt: IsNull() },
    });
    if (!m) throw new ForbiddenException('Vous n\'êtes pas membre de ce groupe');
    return m;
  }

  private async requireRole(
    groupId: string,
    userId: string,
    roles: GroupRoleEnum[],
  ): Promise<UsersInGroup> {
    const m = await this.getMembership(groupId, userId);
    if (!roles.includes(m.roleInGroup)) {
      throw new ForbiddenException('Permission insuffisante');
    }
    return m;
  }
}
