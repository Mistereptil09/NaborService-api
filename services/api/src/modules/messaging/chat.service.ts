import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { REDIS_CLIENT } from '../../database/redis.module';
import Redis from 'ioredis';
import { ChatGroup } from './entities/chat-group.entity';
import { UsersInGroup } from './entities/users-in-group.entity';
import { MessageMetadata } from './entities/message-metadata.entity';
import {
  GroupRoleEnum,
  ChatGroupTypeEnum,
  UserRoleEnum,
} from '../../common/enums';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { neighbourhoodGroupRoleFor } from '../../common/group-role.util';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatGroup)
    private readonly groupRepo: Repository<ChatGroup>,
    @InjectRepository(UsersInGroup)
    private readonly uigRepo: Repository<UsersInGroup>,
    @InjectRepository(MessageMetadata)
    private readonly msgRepo: Repository<MessageMetadata>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Groups ──────────────────────────────────────────────

  async getAllGroups(): Promise<
    {
      id: string;
      name: string | null;
      type: ChatGroupTypeEnum;
      createdBy: string | null;
      createdAt: Date;
      memberCount: number;
      participants: {
        id: string;
        first_name: string;
        last_name: string;
      }[];
    }[]
  > {
    const groups = await this.groupRepo.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    const ids = groups.map((g) => g.id);

    const counts = await this.uigRepo
      .createQueryBuilder('uig')
      .select('uig.groupId', 'groupId')
      .addSelect('COUNT(uig.userId)', 'count')
      .where('uig.leftAt IS NULL')
      .andWhere('uig.kickedAt IS NULL')
      .andWhere('uig.groupId IN (:...ids)', { ids })
      .groupBy('uig.groupId')
      .getRawMany();

    const countMap = new Map<string, number>(
      counts.map((c: { groupId: string; count: string }) => [
        c.groupId,
        parseInt(c.count, 10),
      ]),
    );

    // Participants (both/all sides) — permet à un modérateur/admin d'identifier
    // qui échange avec qui, notamment pour les messages privés (direct_message)
    // qui n'ont pas de nom de groupe humain.
    const participantsMap = new Map<
      string,
      { id: string; first_name: string; last_name: string }[]
    >();
    if (ids.length > 0) {
      const memberships = await this.uigRepo
        .createQueryBuilder('uig')
        .innerJoinAndSelect('uig.user', 'user')
        .where('uig.groupId IN (:...ids)', { ids })
        .andWhere('uig.leftAt IS NULL')
        .andWhere('uig.kickedAt IS NULL')
        .getMany();
      for (const m of memberships) {
        const list = participantsMap.get(m.groupId) ?? [];
        list.push({
          id: m.user.id,
          first_name: m.user.firstName,
          last_name: m.user.lastName,
        });
        participantsMap.set(m.groupId, list);
      }
    }

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      createdBy: g.createdBy,
      createdAt: g.createdAt,
      memberCount: countMap.get(g.id) ?? 0,
      participants: participantsMap.get(g.id) ?? [],
    }));
  }

  async getUserGroups(userId: string) {
    const memberships = await this.uigRepo.find({
      where: { userId, leftAt: IsNull(), kickedAt: IsNull() },
      relations: ['group'],
    });
    const roleByGroupId = new Map(
      memberships.map((m) => [m.groupId, m.roleInGroup]),
    );
    const groups = memberships
      .map((m) => m.group)
      .filter((g) => g && g.deletedAt === null);
    const enriched = await this.enrichGroups(groups, userId);
    return enriched.map((g) => ({
      ...g,
      my_role: roleByGroupId.get(g.id) ?? null,
    }));
  }

  /**
   * Enriches raw groups with `memberCount` (for all groups) and `otherParticipant`
   * (for direct_message groups only — the other active member, for display purposes
   * since a DM's `name` is often not human-assigned). Batched (2 queries), not N+1.
   */
  private async enrichGroups(groups: ChatGroup[], requestingUserId: string) {
    if (groups.length === 0) return [];
    const ids = groups.map((g) => g.id);

    const counts = await this.uigRepo
      .createQueryBuilder('uig')
      .select('uig.groupId', 'groupId')
      .addSelect('COUNT(uig.userId)', 'count')
      .where('uig.leftAt IS NULL')
      .andWhere('uig.kickedAt IS NULL')
      .andWhere('uig.groupId IN (:...ids)', { ids })
      .groupBy('uig.groupId')
      .getRawMany();
    const countMap = new Map<string, number>(
      counts.map((c: { groupId: string; count: string }) => [
        c.groupId,
        parseInt(c.count, 10),
      ]),
    );

    // Mute state se lit depuis Redis (source de vérité pour l'expiration TTL des
    // mutes temporaires) plutôt que la colonne `isMuted`, qui elle ne se remet
    // jamais à false automatiquement quand un mute temporaire expire.
    const muteKeys = ids.map((id) => `mute:${requestingUserId}:${id}`);
    const muteValues = ids.length > 0 ? await this.redis.mget(...muteKeys) : [];
    const mutedSet = new Set(ids.filter((_, i) => muteValues[i] !== null));

    const dmGroupIds = groups
      .filter((g) => g.type === ChatGroupTypeEnum.DIRECT_MESSAGE)
      .map((g) => g.id);

    const otherParticipantMap = new Map<
      string,
      {
        id: string;
        first_name: string;
        last_name: string;
        profile_picture_mongo_id: string | null;
      }
    >();
    if (dmGroupIds.length > 0) {
      const others = await this.uigRepo
        .createQueryBuilder('uig')
        .innerJoinAndSelect('uig.user', 'user')
        .where('uig.groupId IN (:...ids)', { ids: dmGroupIds })
        .andWhere('uig.userId != :requestingUserId', { requestingUserId })
        .andWhere('uig.leftAt IS NULL')
        .andWhere('uig.kickedAt IS NULL')
        .getMany();
      for (const o of others) {
        otherParticipantMap.set(o.groupId, {
          id: o.user.id,
          first_name: o.user.firstName,
          last_name: o.user.lastName,
          profile_picture_mongo_id: o.user.profilePictureMongoId,
        });
      }
    }

    // Non-lus : un COUNT par groupe (borné au nombre de groupes de l'utilisateur,
    // donc pas de N+1 réel) comparé au pointeur de dernière lecture de ce membre
    // (ou à sa date d'adhésion s'il n'a encore jamais rien lu).
    const membershipRows = await this.uigRepo.find({
      where: { userId: requestingUserId, groupId: In(ids) },
      select: ['groupId', 'lastReadAt', 'joinedAt'],
    });
    const membershipMap = new Map(membershipRows.map((m) => [m.groupId, m]));
    const unreadCounts = await Promise.all(
      ids.map(async (id) => {
        const membership = membershipMap.get(id);
        const threshold =
          membership?.lastReadAt ?? membership?.joinedAt ?? new Date(0);
        const count = await this.msgRepo.count({
          where: {
            groupId: id,
            senderId: Not(requestingUserId),
            isDeleted: false,
            sentAt: MoreThan(threshold),
          },
        });
        return [id, count] as const;
      }),
    );
    const unreadMap = new Map(unreadCounts);

    // Nouveaux champs en snake_case (convention des objets de réponse construits
    // à la main dans ce module, ex. toPlainMessage()) ; les champs existants de
    // l'entité restent inchangés (spread) pour ne pas élargir la portée du correctif.
    return groups.map((g) => ({
      ...g,
      member_count: countMap.get(g.id) ?? 0,
      other_participant: otherParticipantMap.get(g.id) ?? null,
      is_muted: mutedSet.has(g.id),
      unread_count: unreadMap.get(g.id) ?? 0,
    }));
  }

  // ── Neighbourhood groups ────────────────────────────────

  async getNeighbourhoodGroup(
    neighbourhoodId: string,
  ): Promise<ChatGroup | null> {
    return this.groupRepo.findOne({
      where: {
        neighbourhoodId,
        type: ChatGroupTypeEnum.NEIGHBOURHOOD,
        deletedAt: IsNull(),
      },
    });
  }

  /** Crée le groupe du quartier s'il n'existe pas encore, puis (ré)applique la liste de membres fournie. Idempotent. */
  async ensureNeighbourhoodGroup(
    neighbourhoodId: string,
    name: string,
    members: { userId: string; role: GroupRoleEnum }[],
  ): Promise<ChatGroup> {
    let group = await this.getNeighbourhoodGroup(neighbourhoodId);
    if (!group) {
      group = await this.groupRepo.save(
        this.groupRepo.create({
          name,
          description: null,
          createdBy: null,
          type: ChatGroupTypeEnum.NEIGHBOURHOOD,
          neighbourhoodId,
        }),
      );
    }
    for (const member of members) {
      await this.upsertMembership(group.id, member.userId, member.role);
    }
    return group;
  }

  /** Crée ou réactive une adhésion avec le rôle donné (généralisation de la logique de re-join d'addMember()). */
  async upsertMembership(
    groupId: string,
    userId: string,
    role: GroupRoleEnum,
  ): Promise<UsersInGroup> {
    const existing = await this.uigRepo.findOne({ where: { groupId, userId } });
    if (existing) {
      if (
        !existing.leftAt &&
        !existing.kickedAt &&
        existing.roleInGroup === role
      ) {
        return existing; // already active with that exact role
      }
      existing.leftAt = null;
      existing.kickedAt = null;
      existing.roleInGroup = role;
      return this.uigRepo.save(existing);
    }
    return this.uigRepo.save(
      this.uigRepo.create({ userId, groupId, roleInGroup: role }),
    );
  }

  /** Retire l'adhésion active (soft-leave), no-op si aucune adhésion active n'existe. */
  async revokeMembership(groupId: string, userId: string): Promise<void> {
    const existing = await this.uigRepo.findOne({
      where: { groupId, userId, leftAt: IsNull(), kickedAt: IsNull() },
    });
    if (!existing) return;
    existing.leftAt = new Date();
    await this.uigRepo.save(existing);
  }

  /** Synchronise l'adhésion d'un résident (non-staff) suite à un changement de quartier. */
  async syncResidentNeighbourhoodMembership(
    userId: string,
    oldNeighbourhoodId: string | null,
    newNeighbourhoodId: string | null,
    groupRole: GroupRoleEnum,
  ): Promise<void> {
    if (oldNeighbourhoodId && oldNeighbourhoodId !== newNeighbourhoodId) {
      const oldGroup = await this.getNeighbourhoodGroup(oldNeighbourhoodId);
      if (oldGroup) await this.revokeMembership(oldGroup.id, userId);
    }
    if (newNeighbourhoodId) {
      const newGroup = await this.getNeighbourhoodGroup(newNeighbourhoodId);
      // Pas de groupe pour ce quartier (créé avant cette fonctionnalité) : auto-cicatrisé
      // via l'endpoint de backfill admin, pas d'échec de la mise à jour du profil ici.
      if (newGroup) await this.upsertMembership(newGroup.id, userId, groupRole);
    }
  }

  /** Resynchronise l'adhésion au groupe de quartier courant suite à un changement de rôle global. */
  async resyncNeighbourhoodGroupMembershipForRoleChange(
    userId: string,
    newRole: UserRoleEnum,
    currentNeighbourhoodId: string | null,
  ): Promise<void> {
    if (!currentNeighbourhoodId) return;
    const group = await this.getNeighbourhoodGroup(currentNeighbourhoodId);
    if (!group) return;
    await this.upsertMembership(
      group.id,
      userId,
      neighbourhoodGroupRoleFor(newRole),
    );
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
    if (!group || group.deletedAt)
      throw new NotFoundException('Groupe introuvable');
    return group;
  }

  /** Enriched variant of getGroupDetail for API responses (adds memberCount/otherParticipant/myRole). */
  async getGroupDetailForUser(groupId: string, requestingUserId: string) {
    const group = await this.getGroupDetail(groupId);
    const [enriched] = await this.enrichGroups([group], requestingUserId);
    const membership = await this.uigRepo.findOne({
      where: {
        groupId,
        userId: requestingUserId,
        leftAt: IsNull(),
        kickedAt: IsNull(),
      },
    });
    return { ...enriched, my_role: membership?.roleInGroup ?? null };
  }

  async updateGroup(groupId: string, userId: string, dto: UpdateGroupDto) {
    await this.requireRole(groupId, userId, [
      GroupRoleEnum.ACTIONS,
      GroupRoleEnum.ADMIN,
    ]);
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
    await this.requireRole(groupId, inviterId, [
      GroupRoleEnum.ACTIONS,
      GroupRoleEnum.ADMIN,
    ]);
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

  async changeRole(
    groupId: string,
    targetUserId: string,
    newRole: GroupRoleEnum,
    adminId: string,
  ) {
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

  /** Déplace le pointeur "dernière lecture" du membre à maintenant (base du badge non-lus). */
  async markGroupRead(groupId: string, userId: string): Promise<void> {
    await this.getMembership(groupId, userId);
    await this.uigRepo.update({ groupId, userId }, { lastReadAt: new Date() });
  }

  // ── Permission helpers ──────────────────────────────────

  async isMember(groupId: string, userId: string): Promise<boolean> {
    const m = await this.uigRepo.findOne({
      where: { groupId, userId, leftAt: IsNull(), kickedAt: IsNull() },
    });
    return m !== null;
  }

  /** Rôle "watch" = lecture seule : ne peut ni envoyer de message ni réagir. */
  async assertCanParticipate(
    groupId: string,
    userId: string,
  ): Promise<UsersInGroup> {
    const m = await this.getMembership(groupId, userId);
    if (m.roleInGroup === GroupRoleEnum.WATCH) {
      throw new ForbiddenException(
        'Rôle "watch" : lecture seule dans ce groupe',
      );
    }
    return m;
  }

  private async getMembership(
    groupId: string,
    userId: string,
  ): Promise<UsersInGroup> {
    const m = await this.uigRepo.findOne({
      where: { groupId, userId, leftAt: IsNull(), kickedAt: IsNull() },
    });
    if (!m) throw new ForbiddenException("Vous n'êtes pas membre de ce groupe");
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

  /** Variante publique de requireRole(), pour les modules externes (ex. PollsController) qui doivent vérifier un rôle de groupe. */
  async assertGroupRole(
    groupId: string,
    userId: string,
    roles: GroupRoleEnum[],
  ): Promise<UsersInGroup> {
    return this.requireRole(groupId, userId, roles);
  }
}
