import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Follow } from '../social/entities/follow.entity';
import { UpdateProfileDto } from './dto/user-routes.dtos';
import { TotpService } from '../auth/totp.service';
import { SessionService } from '../auth/session.service';
import { VisibilityEnum, UserRoleEnum } from '../../common/enums';
import { Neo4jHealthService } from '../geo/neo4j-health.service';
import { UserSocialService } from './user-social.service';
import { ChatService } from '../messaging/chat.service';
import { isModeratorOrAdmin } from '../../common/ownership';
import { neighbourhoodGroupRoleFor } from '../../common/group-role.util';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    private readonly totpService: TotpService,
    private readonly sessionService: SessionService,
    private readonly userSocialService: UserSocialService,
    private readonly chatService: ChatService,
    @Inject('BullQueue_neo4j-sync')
    private readonly neo4jSyncQueue: {
      add: (name: string, data: any) => Promise<any>;
    },
    @Inject('BullQueue_rgpd-anonymise')
    private readonly rgpdAnonymiseQueue: {
      add: (name: string, data: any) => Promise<any>;
    },
    @Optional()
    private readonly healthService?: Neo4jHealthService,
  ) {}

  private async enqueueSync(name: string, data: any): Promise<void> {
    if (this.healthService && !this.healthService.isHealthy()) {
      this.logger.warn(
        `Neo4j down — skipping ${name} sync job (reconciliation will catch up)`,
      );
      return;
    }
    await this.neo4jSyncQueue.add(name, data);
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  async getProfile(userId: string): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'role',
        'visibility',
        'bio',
        'locale',
        'messagePolicy',
        'neighbourhoodId',
        'profilePictureMongoId',
        'bannerMongoId',
        'createdAt',
        'updatedAt',
      ],
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  private async verifyUserTotp(userId: string, code: string): Promise<void> {
    return this.totpService.verifyTotp(userId, code);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Partial<User>> {
    const user = await this.findById(userId);

    // If sensitive field (email) is provided, verify TOTP
    if (dto.email && dto.email !== user.email) {
      if (!dto.totpCode) {
        throw new ForbiddenException('TOTP requis');
      }
      await this.verifyUserTotp(userId, dto.totpCode);

      // Check unique email constraint
      const existing = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email déjà utilisé');
      }
    }

    const updatePayload: any = {};
    if (dto.firstName !== undefined) updatePayload.firstName = dto.firstName;
    if (dto.lastName !== undefined) updatePayload.lastName = dto.lastName;
    if (dto.bio !== undefined) updatePayload.bio = dto.bio;
    if (dto.visibility !== undefined) updatePayload.visibility = dto.visibility;
    if (dto.messagePolicy !== undefined)
      updatePayload.messagePolicy = dto.messagePolicy;

    let neighbourhoodChanged = false;
    if (dto.neighbourhoodId !== undefined) {
      if (dto.neighbourhoodId !== user.neighbourhoodId) {
        updatePayload.neighbourhoodId = dto.neighbourhoodId;
        neighbourhoodChanged = true;
      }
    }

    if (dto.email !== undefined) updatePayload.email = dto.email;

    updatePayload.updatedAt = new Date();

    if (Object.keys(updatePayload).length > 0) {
      await this.userRepository.update(userId, updatePayload);

      if (neighbourhoodChanged) {
        await this.enqueueSync('user.lives_in.update', {
          userId,
          neighbourhoodId: dto.neighbourhoodId,
        });

        // Le staff (mod/admin) a déjà accès à tous les groupes de quartier —
        // son adhésion ne dépend pas de sa résidence, donc on ne la touche pas ici.
        if (!isModeratorOrAdmin(user.role)) {
          await this.chatService.syncResidentNeighbourhoodMembership(
            userId,
            user.neighbourhoodId,
            dto.neighbourhoodId ?? null,
            neighbourhoodGroupRoleFor(user.role),
          );
        }
      }
    }

    return this.getProfile(userId);
  }

  async softDelete(userId: string, totpCode: string): Promise<void> {
    await this.verifyUserTotp(userId, totpCode);

    const user = await this.findById(userId);

    const now = new Date();
    user.deletedAt = now;
    await this.userRepository.save(user);

    // Publish to Neo4j Sync Queue and Anonymise queue
    await this.enqueueSync('user.soft_delete', {
      userId,
      deletedAt: now,
    });
    await this.rgpdAnonymiseQueue.add('user.anonymise', { userId });

    // Revoke all sessions
    await this.sessionService.revokeAllUserSessions(userId);
  }

  async exportJson(userId: string): Promise<any> {
    const profile = await this.getProfile(userId);

    let listings;
    try {
      listings = await this.userRepository.manager.query(
        'SELECT * FROM listings WHERE creator_id = $1 AND deleted_at IS NULL',
        [userId],
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Impossible d'exporter les annonces : ${err.message}`,
      );
    }

    let messages;
    try {
      messages = await this.userRepository.manager.query(
        'SELECT * FROM message_metadata WHERE sender_id = $1 AND is_deleted = false',
        [userId],
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Impossible d'exporter les messages : ${err.message}`,
      );
    }

    let eventParticipations;
    try {
      eventParticipations = await this.userRepository.manager.query(
        'SELECT * FROM event_participants WHERE user_id = $1',
        [userId],
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Impossible d'exporter les participations aux événements : ${err.message}`,
      );
    }

    let votes;
    try {
      votes = await this.userRepository.manager.query(
        'SELECT * FROM votes WHERE user_id = $1',
        [userId],
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Impossible d'exporter les votes : ${err.message}`,
      );
    }

    let socialGraph;
    try {
      const followers = await this.userRepository.manager.query(
        'SELECT * FROM follows WHERE followed_id = $1',
        [userId],
      );
      const following = await this.userRepository.manager.query(
        'SELECT * FROM follows WHERE follower_id = $1',
        [userId],
      );
      const blocked = await this.userRepository.manager.query(
        'SELECT * FROM user_blocks WHERE blocker_id = $1',
        [userId],
      );
      socialGraph = { followers, following, blocked };
    } catch (err) {
      throw new InternalServerErrorException(
        `Impossible d'exporter le graphe social : ${err.message}`,
      );
    }

    let incidents;
    try {
      incidents = await this.userRepository.manager.query(
        'SELECT * FROM user_reports WHERE reporter_id = $1',
        [userId],
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Impossible d'exporter les incidents : ${err.message}`,
      );
    }

    return {
      profile,
      socialGraph,
      listings,
      messages,
      eventParticipations,
      votes,
      incidents,
    };
  }

  async exportCsv(userId: string): Promise<string> {
    const data = await this.exportJson(userId);
    let csv = 'Format,Table,RecordID,Details\n';

    // 1. Profile
    csv += `JSON,users,${data.profile.id},"firstName: ${data.profile.firstName}; lastName: ${data.profile.lastName}; email: ${data.profile.email}; locale: ${data.profile.locale}"\n`;

    // 2. Listings
    for (const l of data.listings) {
      csv += `JSON,listings,${l.id},"title: ${l.title}; type: ${l.listing_type}; status: ${l.status}"\n`;
    }

    // 3. Messages
    for (const m of data.messages) {
      csv += `JSON,message_metadata,${m.id},"groupId: ${m.group_id}; sentAt: ${m.sent_at}"\n`;
    }

    // 4. Event participations
    for (const ep of data.eventParticipations) {
      csv += `JSON,event_participants,${ep.event_id},"status: ${ep.status}; payment: ${ep.payment_status}"\n`;
    }

    // 5. Votes
    for (const v of data.votes) {
      csv += `JSON,votes,${v.option_id},"weight: ${v.weight}"\n`;
    }

    // 6. Social Graph
    for (const f of data.socialGraph.following) {
      csv += `JSON,follows,${f.id},"followedId: ${f.followed_id}; followedAt: ${f.created_at}"\n`;
    }
    for (const f of data.socialGraph.followers) {
      csv += `JSON,follows,${f.id},"followerId: ${f.follower_id}; followedAt: ${f.created_at}"\n`;
    }
    for (const b of data.socialGraph.blocked) {
      csv += `JSON,user_blocks,${b.id},"blockedId: ${b.blocked_id}; blockedAt: ${b.created_at}"\n`;
    }

    // 7. Incidents
    for (const i of data.incidents) {
      csv += `JSON,user_reports,${i.id},"reportedId: ${i.reported_id}; reason: ${i.reason}; status: ${i.status}"\n`;
    }

    return csv;
  }

  async getPublicProfile(requesterId: string, targetId: string): Promise<any> {
    // Check target exists and not deleted
    const target = await this.userRepository.findOne({
      where: { id: targetId, deletedAt: IsNull() },
    });
    if (!target) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Check block relationship in either direction
    const isBlocked = await this.userSocialService.isBlocked(
      requesterId,
      targetId,
    );
    if (isBlocked) {
      throw new NotFoundException('Utilisateur introuvable'); // Masking block relationship
    }

    // Relationship from the requester's point of view. isFriend (mutual
    // follow) tells the front whether a direct_message group already
    // exists — it's only auto-created between mutual follows (see
    // UserSocialService.follow).
    const [follow, followBack, blockByMe] = await Promise.all([
      this.followRepository.findOne({
        where: { followerId: requesterId, followedId: targetId },
      }),
      this.followRepository.findOne({
        where: { followerId: targetId, followedId: requesterId },
      }),
      this.userSocialService.hasBlocked(requesterId, targetId),
    ]);
    const isFriend = !!follow && !!followBack;
    const relationship = {
      isFollowing: !!follow,
      isFriend,
      isBlockedByMe: blockByMe,
    };

    if (target.visibility === VisibilityEnum.PRIVATE) {
      return {
        id: target.id,
        firstName: target.firstName,
        lastName: target.lastName,
        visibility: target.visibility,
        ...relationship,
      };
    }

    if (target.visibility === VisibilityEnum.FRIENDS && !isFriend) {
      return {
        id: target.id,
        firstName: target.firstName,
        lastName: target.lastName,
        visibility: target.visibility,
        ...relationship,
      };
    }

    // Otherwise return full public profile
    return {
      id: target.id,
      firstName: target.firstName,
      lastName: target.lastName,
      visibility: target.visibility,
      bio: target.bio,
      neighbourhoodId: target.neighbourhoodId,
      profilePictureMongoId: target.profilePictureMongoId,
      bannerMongoId: target.bannerMongoId,
      role: target.role,
      createdAt: target.createdAt,
      ...relationship,
    };
  }

  async findAllAdmin(query: {
    offset: number;
    limit: number;
    role?: UserRoleEnum;
    neighbourhoodId?: string;
    q?: string;
  }): Promise<{
    data: User[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .withDeleted();

    if (query.role) {
      queryBuilder.andWhere('user.role = :role', { role: query.role });
    }
    if (query.neighbourhoodId) {
      queryBuilder.andWhere('user.neighbourhoodId = :neighbourhoodId', {
        neighbourhoodId: query.neighbourhoodId,
      });
    }
    if (query.q) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${query.q}%` },
      );
    }

    const [data, total] = await queryBuilder
      .orderBy('user.createdAt', 'DESC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    // { data, meta: { total, offset, limit } } — same pagination envelope
    // used across the rest of the API.
    return { data, meta: { total, offset: query.offset, limit: query.limit } };
  }

  async findOneAdmin(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      withDeleted: true,
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  async updateRole(userId: string, role: UserRoleEnum): Promise<User> {
    const user = await this.findOneAdmin(userId);
    const oldRole = user.role;
    user.role = role;
    user.updatedAt = new Date();
    await this.userRepository.save(user);

    // Sync role to Neo4j
    await this.enqueueSync('upsert-user', {
      pgId: user.id,
      visibility: user.visibility,
      role: user.role,
      neighbourhoodId: user.neighbourhoodId,
    });

    if (oldRole !== role) {
      await this.chatService.resyncNeighbourhoodGroupMembershipForRoleChange(
        userId,
        role,
        user.neighbourhoodId,
      );
    }

    return user;
  }

  async suspendUser(userId: string): Promise<User> {
    const user = await this.findOneAdmin(userId);
    user.isSuspended = true;
    user.suspendedAt = new Date();
    user.updatedAt = new Date();
    await this.userRepository.save(user);

    // Revoke all sessions
    await this.sessionService.revokeAllUserSessions(userId);

    return user;
  }

  async restoreUser(userId: string): Promise<User> {
    const user = await this.findOneAdmin(userId);
    user.isSuspended = false;
    user.suspendedAt = null;
    user.updatedAt = new Date();
    await this.userRepository.save(user);

    return user;
  }

  async adminSoftDelete(userId: string): Promise<void> {
    const user = await this.findOneAdmin(userId);
    if (user.deletedAt !== null) {
      throw new ConflictException('Compte déjà supprimé');
    }

    const now = new Date();
    user.deletedAt = now;
    await this.userRepository.save(user);

    // Publish to Neo4j Sync Queue and Anonymise queue
    await this.enqueueSync('user.soft_delete', {
      userId,
      deletedAt: now,
    });
    await this.rgpdAnonymiseQueue.add('user.anonymise', { userId });

    // Revoke all sessions
    await this.sessionService.revokeAllUserSessions(userId);
  }

  async disableTotp(userId: string): Promise<void> {
    const user = await this.findOneAdmin(userId);
    user.totpSecret = null;
    user.updatedAt = new Date();
    await this.userRepository.save(user);
  }
}
