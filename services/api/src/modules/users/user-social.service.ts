import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { User } from './entities/user.entity';
import { Follow } from '../social/entities/follow.entity';
import { Friendship } from '../social/entities/friendship.entity';
import { UserBlock } from '../social/entities/user-block.entity';
import { UserReport } from './entities/user-report.entity';
import { PaginationDto } from './dto/user-routes.dtos';
import { ChatGroup } from '../messaging/entities/chat-group.entity';
import { UsersInGroup } from '../messaging/entities/users-in-group.entity';
import { ChatGroupTypeEnum, GroupRoleEnum } from '../../common/enums';
import { Neo4jHealthService } from '../geo/neo4j-health.service';
import { NotificationsService } from '../messaging/notifications.service';

@Injectable()
export class UserSocialService {
  private readonly logger = new Logger(UserSocialService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    @InjectRepository(Friendship)
    private readonly friendshipRepository: Repository<Friendship>,
    @InjectRepository(UserBlock)
    private readonly blockRepository: Repository<UserBlock>,
    @InjectRepository(UserReport)
    private readonly reportRepository: Repository<UserReport>,
    @InjectRepository(ChatGroup)
    private readonly chatGroupRepository: Repository<ChatGroup>,
    @InjectRepository(UsersInGroup)
    private readonly usersInGroupRepository: Repository<UsersInGroup>,
    @Inject('BullQueue_neo4j-sync')
    private readonly neo4jSyncQueue: {
      add: (name: string, data: any) => Promise<any>;
    },
    private readonly notificationsService: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional()
    private readonly healthService?: Neo4jHealthService,
  ) {}

  /**
   * Enqueues a Neo4j sync job only if the circuit breaker allows it.
   * When Neo4j is down, skips the job — reconciliation will catch up.
   */
  private async enqueueSync(name: string, data: any): Promise<void> {
    if (this.healthService && !this.healthService.isHealthy()) {
      this.logger.warn(
        `Neo4j down — skipping ${name} sync job (reconciliation will catch up)`,
      );
      return;
    }
    await this.neo4jSyncQueue.add(name, data);
  }

  async getBlockedUserIds(userId: string): Promise<string[]> {
    const blocks = await this.blockRepository.find({
      where: [{ blockerId: userId }, { blockedId: userId }],
    });
    const ids = blocks.map((b) =>
      b.blockerId === userId ? b.blockedId : b.blockerId,
    );
    return [...new Set(ids)];
  }

  /** True if either user has blocked the other, in either direction. */
  async isBlocked(userIdA: string, userIdB: string): Promise<boolean> {
    const block = await this.blockRepository.findOne({
      where: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    });
    return block !== null;
  }

  async follow(followerId: string, followedId: string): Promise<void> {
    if (followerId === followedId) {
      throw new BadRequestException('Vous ne pouvez pas vous suivre vous-même');
    }

    const followedUser = await this.userRepository.findOne({
      where: { id: followedId, deletedAt: IsNull() },
    });
    if (!followedUser) {
      throw new NotFoundException('Utilisateur cible introuvable');
    }

    // Check block in opposite direction (if target blocked me, I cannot follow them)
    const isBlocked = await this.blockRepository.findOne({
      where: { blockerId: followedId, blockedId: followerId },
    });
    if (isBlocked) {
      throw new ForbiddenException('Action non autorisée');
    }

    const existingFollow = await this.followRepository.findOne({
      where: { followerId, followedId },
    });
    if (existingFollow) {
      throw new ConflictException('Vous suivez déjà cet utilisateur');
    }

    const follow = this.followRepository.create({ followerId, followedId });
    await this.followRepository.save(follow);

    // Publish to Neo4j Sync Queue
    await this.enqueueSync('user.follows.create', {
      followerId,
      followedId,
    });

    // Notify the followed user (in-app + email relay if offline).
    try {
      await this.notificationsService.create({
        userId: followedId,
        type: 'new_follower',
        payload: { firstName: followedUser.firstName, followerId },
      });
    } catch (error: any) {
      this.logger.warn(
        `new_follower notification failed for ${followedId}: ${error?.message ?? error}`,
      );
    }

    // Check for mutual follow
    const mutualFollow = await this.followRepository.findOne({
      where: { followerId: followedId, followedId: followerId },
    });

    if (mutualFollow) {
      const u1 = followerId < followedId ? followerId : followedId;
      const u2 = followerId < followedId ? followedId : followerId;

      const existingFriendship = await this.friendshipRepository.findOne({
        where: { user1Id: u1, user2Id: u2 },
      });

      if (!existingFriendship) {
        const chatGroup = this.chatGroupRepository.create({
          createdBy: u1,
          type: ChatGroupTypeEnum.DIRECT_MESSAGE,
        });
        const savedGroup = await this.chatGroupRepository.save(chatGroup);

        const uig1 = this.usersInGroupRepository.create({
          userId: u1,
          groupId: savedGroup.id,
          roleInGroup: GroupRoleEnum.MESSAGE,
        });
        const uig2 = this.usersInGroupRepository.create({
          userId: u2,
          groupId: savedGroup.id,
          roleInGroup: GroupRoleEnum.MESSAGE,
        });
        await this.usersInGroupRepository.save([uig1, uig2]);

        const friendship = this.friendshipRepository.create({
          user1Id: u1,
          user2Id: u2,
          groupId: savedGroup.id,
        });
        await this.friendshipRepository.save(friendship);
      } else if (existingFriendship.unfriendedAt) {
        existingFriendship.unfriendedAt = null;
        await this.friendshipRepository.save(existingFriendship);
      }

      await this.enqueueSync('user.friends_with.create', {
        userId1: u1,
        userId2: u2,
      });
    }
  }

  async unfollow(followerId: string, followedId: string): Promise<void> {
    const follow = await this.followRepository.findOne({
      where: { followerId, followedId },
    });
    if (!follow) {
      throw new NotFoundException('Vous ne suivez pas cet utilisateur');
    }

    await this.followRepository.delete({ followerId, followedId });
    await this.enqueueSync('user.follows.delete', {
      followerId,
      followedId,
    });

    // Break mutual friendship
    const u1 = followerId < followedId ? followerId : followedId;
    const u2 = followerId < followedId ? followedId : followerId;

    const friendship = await this.friendshipRepository.findOne({
      where: { user1Id: u1, user2Id: u2, unfriendedAt: IsNull() },
    });

    if (friendship) {
      friendship.unfriendedAt = new Date();
      await this.friendshipRepository.save(friendship);
      await this.enqueueSync('user.friends_with.delete', {
        userId1: u1,
        userId2: u2,
      });
    }
  }

  async getFollowers(
    userId: string,
    pagination: PaginationDto = new PaginationDto(),
  ): Promise<{
    data: any[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const targetUser = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    if (!targetUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const [follows, total] = await this.followRepository.findAndCount({
      where: { followedId: userId },
      relations: ['follower'],
      skip: pagination.offset,
      take: pagination.limit,
    });

    const data = follows.map((f) => ({
      id: f.follower.id,
      firstName: f.follower.firstName,
      lastName: f.follower.lastName,
      profilePictureMongoId: f.follower.profilePictureMongoId,
    }));

    return {
      data,
      meta: {
        total,
        offset: pagination.offset,
        limit: pagination.limit,
      },
    };
  }

  async getFollowing(
    userId: string,
    pagination: PaginationDto = new PaginationDto(),
  ): Promise<{
    data: any[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const targetUser = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    if (!targetUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const [follows, total] = await this.followRepository.findAndCount({
      where: { followerId: userId },
      relations: ['followed'],
      skip: pagination.offset,
      take: pagination.limit,
    });

    const data = follows.map((f) => ({
      id: f.followed.id,
      firstName: f.followed.firstName,
      lastName: f.followed.lastName,
      profilePictureMongoId: f.followed.profilePictureMongoId,
    }));

    return {
      data,
      meta: {
        total,
        offset: pagination.offset,
        limit: pagination.limit,
      },
    };
  }

  async getFriends(
    userId: string,
    pagination: PaginationDto = new PaginationDto(),
  ): Promise<{
    data: any[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const targetUser = await this.userRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    if (!targetUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const [friendships, total] = await this.friendshipRepository.findAndCount({
      where: [
        { user1Id: userId, unfriendedAt: IsNull() },
        { user2Id: userId, unfriendedAt: IsNull() },
      ],
      relations: ['user1', 'user2'],
      skip: pagination.offset,
      take: pagination.limit,
    });

    const data = friendships.map((f) => {
      const friend = f.user1Id === userId ? f.user2 : f.user1;
      return {
        id: friend.id,
        firstName: friend.firstName,
        lastName: friend.lastName,
        profilePictureMongoId: friend.profilePictureMongoId,
      };
    });

    return {
      data,
      meta: {
        total,
        offset: pagination.offset,
        limit: pagination.limit,
      },
    };
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new BadRequestException(
        'Vous ne pouvez pas vous bloquer vous-même',
      );
    }

    const targetUser = await this.userRepository.findOne({
      where: { id: blockedId, deletedAt: IsNull() },
    });
    if (!targetUser) {
      throw new NotFoundException('Utilisateur cible introuvable');
    }

    const existingBlock = await this.blockRepository.findOne({
      where: { blockerId, blockedId },
    });
    if (existingBlock) {
      throw new ConflictException('Vous bloquez déjà cet utilisateur');
    }

    const block = this.blockRepository.create({ blockerId, blockedId });
    await this.blockRepository.save(block);

    // Invalidate the cached feed so a re-fetch doesn't keep serving this
    // now-blocked user back (would otherwise 409 on a repeat block attempt).
    await this.redis.del(`discover:${blockerId}`);

    await this.enqueueSync('user.blocks.create', {
      blockerId,
      blockedId,
    });

    // Clean up follows in both directions
    await this.followRepository.delete({
      followerId: blockerId,
      followedId: blockedId,
    });
    await this.followRepository.delete({
      followerId: blockedId,
      followedId: blockerId,
    });
    await this.enqueueSync('user.follows.delete', {
      followerId: blockerId,
      followedId: blockedId,
    });
    await this.enqueueSync('user.follows.delete', {
      followerId: blockedId,
      followedId: blockerId,
    });

    // Clean up friendships
    const u1 = blockerId < blockedId ? blockerId : blockedId;
    const u2 = blockerId < blockedId ? blockedId : blockerId;

    const friendship = await this.friendshipRepository.findOne({
      where: { user1Id: u1, user2Id: u2, unfriendedAt: IsNull() },
    });

    if (friendship) {
      friendship.unfriendedAt = new Date();
      await this.friendshipRepository.save(friendship);
      await this.enqueueSync('user.friends_with.delete', {
        userId1: u1,
        userId2: u2,
      });
    }
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    const block = await this.blockRepository.findOne({
      where: { blockerId, blockedId },
    });
    if (!block) {
      throw new NotFoundException('Vous ne bloquez pas cet utilisateur');
    }

    await this.blockRepository.delete({ blockerId, blockedId });
    await this.enqueueSync('user.blocks.delete', {
      blockerId,
      blockedId,
    });
  }

  async getBlocked(
    userId: string,
    pagination: PaginationDto = new PaginationDto(),
  ): Promise<{
    data: any[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const [blocks, total] = await this.blockRepository.findAndCount({
      where: { blockerId: userId },
      relations: ['blocked'],
      skip: pagination.offset,
      take: pagination.limit,
    });

    const data = blocks.map((b) => ({
      id: b.blocked.id,
      firstName: b.blocked.firstName,
      lastName: b.blocked.lastName,
      profilePictureMongoId: b.blocked.profilePictureMongoId,
    }));

    return {
      data,
      meta: {
        total,
        offset: pagination.offset,
        limit: pagination.limit,
      },
    };
  }

  async report(
    reporterId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('Le motif du signalement est obligatoire');
    }

    const targetUser = await this.userRepository.findOne({
      where: { id: targetId, deletedAt: IsNull() },
    });
    if (!targetUser) {
      throw new NotFoundException('Utilisateur cible introuvable');
    }

    const report = this.reportRepository.create({
      reporterId,
      reportedId: targetId,
      reason,
    });
    await this.reportRepository.save(report);
  }
}
