import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Follow } from '../social/entities/follow.entity';
import { Friendship } from '../social/entities/friendship.entity';
import { UserBlock } from '../social/entities/user-block.entity';
import { UpdateProfileDto } from './dto/user-routes.dtos';
import { TotpService } from '../auth/totp.service';
import { SessionService } from '../auth/session.service';
import { VisibilityEnum } from '../../common/enums';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticator } = require('otplib');

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    @InjectRepository(UserBlock)
    private readonly blockRepository: Repository<UserBlock>,
    private readonly totpService: TotpService,
    private readonly sessionService: SessionService,
    @Inject('BullQueue_neo4j-sync')
    private readonly neo4jSyncQueue: { add: (name: string, data: any) => Promise<any> },
    @Inject('BullQueue_rgpd-anonymise')
    private readonly rgpdAnonymiseQueue: { add: (name: string, data: any) => Promise<any> },
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id, deletedAt: IsNull() } });
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
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!user.totpSecret) {
      throw new ForbiddenException('TOTP non configuré');
    }

    let secret: string;
    try {
      secret = this.totpService.decryptSecret(user.totpSecret);
    } catch {
      throw new ForbiddenException('Erreur de déchiffrement du secret');
    }

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      throw new ForbiddenException('TOTP requis ou invalide');
    }
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<Partial<User>> {
    const user = await this.findById(userId);

    // If sensitive field (email) is provided, verify TOTP
    if (dto.email && dto.email !== user.email) {
      if (!dto.totpCode) {
        throw new ForbiddenException('TOTP requis');
      }
      await this.verifyUserTotp(userId, dto.totpCode);

      // Check unique email constraint
      const existing = await this.userRepository.findOne({ where: { email: dto.email } });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email déjà utilisé');
      }
    }

    const updatePayload: any = {};
    if (dto.firstName !== undefined) updatePayload.firstName = dto.firstName;
    if (dto.lastName !== undefined) updatePayload.lastName = dto.lastName;
    if (dto.bio !== undefined) updatePayload.bio = dto.bio;
    if (dto.visibility !== undefined) updatePayload.visibility = dto.visibility;
    if (dto.messagePolicy !== undefined) updatePayload.messagePolicy = dto.messagePolicy;

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
        await this.neo4jSyncQueue.add('user.lives_in.update', {
          userId,
          neighbourhoodId: dto.neighbourhoodId,
        });
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
    await this.neo4jSyncQueue.add('user.soft_delete', { userId, deletedAt: now });
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
      throw new InternalServerErrorException(`Impossible d'exporter les annonces : ${err.message}`);
    }

    let messages;
    try {
      messages = await this.userRepository.manager.query(
        'SELECT * FROM message_metadata WHERE sender_id = $1 AND is_deleted = false',
        [userId],
      );
    } catch (err) {
      throw new InternalServerErrorException(`Impossible d'exporter les messages : ${err.message}`);
    }

    let eventParticipations;
    try {
      eventParticipations = await this.userRepository.manager.query(
        'SELECT * FROM event_participants WHERE user_id = $1',
        [userId],
      );
    } catch (err) {
      throw new InternalServerErrorException(`Impossible d'exporter les participations aux événements : ${err.message}`);
    }

    let votes;
    try {
      votes = await this.userRepository.manager.query(
        'SELECT * FROM votes WHERE user_id = $1',
        [userId],
      );
    } catch (err) {
      throw new InternalServerErrorException(`Impossible d'exporter les votes : ${err.message}`);
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
      throw new InternalServerErrorException(`Impossible d'exporter le graphe social : ${err.message}`);
    }

    let incidents;
    try {
      incidents = await this.userRepository.manager.query(
        'SELECT * FROM user_reports WHERE reporter_id = $1',
        [userId],
      );
    } catch (err) {
      throw new InternalServerErrorException(`Impossible d'exporter les incidents : ${err.message}`);
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
    const target = await this.userRepository.findOne({ where: { id: targetId, deletedAt: IsNull() } });
    if (!target) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Check block relationship
    const isBlocked = await this.blockRepository.findOne({
      where: [
        { blockerId: requesterId, blockedId: targetId },
        { blockerId: targetId, blockedId: requesterId },
      ],
    });
    if (isBlocked) {
      throw new NotFoundException('Utilisateur introuvable'); // Masking block relationship
    }

    if (target.visibility === VisibilityEnum.PRIVATE) {
      return {
        id: target.id,
        firstName: target.firstName,
        lastName: target.lastName,
        visibility: target.visibility,
      };
    }

    if (target.visibility === VisibilityEnum.FRIENDS) {
      // Check mutual follow
      const f1 = await this.followRepository.findOne({ where: { followerId: requesterId, followedId: targetId } });
      const f2 = await this.followRepository.findOne({ where: { followerId: targetId, followedId: requesterId } });
      const isMutual = f1 && f2;

      if (!isMutual) {
        return {
          id: target.id,
          firstName: target.firstName,
          lastName: target.lastName,
          visibility: target.visibility,
        };
      }
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
    };
  }
}
