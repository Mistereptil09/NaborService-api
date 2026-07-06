import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Repository } from 'typeorm';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { REDIS_CLIENT } from '../../database/redis.module';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { MessageMetadata } from './entities/message-metadata.entity';
import { MessageReadReceipt } from './entities/message-read-receipt.entity';
import { ChatGroup } from './entities/chat-group.entity';
import {
  Message,
  MessageDocument,
} from '../../database/mongo-schemas/schemas/message.schema';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

const AES_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const MESSAGES_PER_PAGE = 50;
const GROUP_KEY_CACHE_TTL = 3600; // Redis cache TTL: 1 hour — PG is the source of truth

@Injectable()
export class ChatMessageService {
  constructor(
    @InjectRepository(MessageMetadata)
    private readonly msgRepo: Repository<MessageMetadata>,
    @InjectRepository(MessageReadReceipt)
    private readonly receiptRepo: Repository<MessageReadReceipt>,
    @InjectRepository(ChatGroup)
    private readonly groupRepo: Repository<ChatGroup>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly chatService: ChatService,
    private readonly configService: ConfigService,
  ) {}

  // ── Send ────────────────────────────────────────────────

  async sendMessage(
    groupId: string,
    senderId: string,
    dto: SendMessageDto,
  ) {
    if (!(await this.chatService.isMember(groupId, senderId))) {
      throw new ForbiddenException('Vous n\'êtes pas membre de ce groupe');
    }
    if (await this.chatService.isMuted(groupId, senderId)) {
      throw new ForbiddenException('Vous êtes en sourdine dans ce groupe');
    }

    const groupKey = await this.getOrCreateGroupKey(groupId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGO, groupKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(dto.content, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // MongoDB: encrypted content
    const mongoMsg = await this.messageModel.create({
      pg_message_id: '', // placeholder, filled after PG insert
      pg_group_id: groupId,
      pg_sender_id: senderId,
      content_encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      auth_tag: authTag.toString('base64'),
      type: dto.type,
      attachments: [],
      reactions: [],
      sent_at: new Date(),
    });

    // PostgreSQL: metadata
    const metadata = this.msgRepo.create({
      id: mongoMsg._id.toString(),
      mongoMessageId: mongoMsg._id.toString(),
      groupId,
      senderId,
      sentAt: new Date(),
    });
    await this.msgRepo.save(metadata);

    // Update MongoDB with the PG ID
    mongoMsg.pg_message_id = metadata.id;
    await mongoMsg.save();

    return this.toPlainMessage(mongoMsg, metadata, groupKey);
  }

  // ── Get history ─────────────────────────────────────────

  async getMessages(
    groupId: string,
    userId: string,
    cursor?: string,
    limit = MESSAGES_PER_PAGE,
  ) {
    if (!(await this.chatService.isMember(groupId, userId))) {
      throw new ForbiddenException('Vous n\'êtes pas membre de ce groupe');
    }

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.groupId = :groupId', { groupId })
      .andWhere('m.isDeleted = false')
      .orderBy('m.sentAt', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(Buffer.from(cursor, 'base64').toString('utf-8'));
      qb.andWhere('m.sentAt < :cursor', { cursor: cursorDate });
    }

    const metadata = await qb.getMany();
    const hasMore = metadata.length > limit;
    if (hasMore) metadata.pop();

    // Fetch encrypted content from MongoDB
    const mongoIds = metadata.map((m) => m.mongoMessageId);
    const mongoDocs = await this.messageModel
      .find({ pg_message_id: { $in: mongoIds } })
      .lean();

    const groupKey = await this.getGroupKey(groupId);
    const messages = metadata.map((pg) => {
      const mongo = mongoDocs.find(
        (d) => d.pg_message_id === pg.id,
      );
      return this.toPlainMessage(mongo ?? null, pg, groupKey);
    });

    const nextCursor =
      hasMore && metadata.length > 0
        ? Buffer.from(metadata[metadata.length - 1].sentAt.toISOString()).toString('base64')
        : undefined;

    return { messages, has_more: hasMore, cursor: nextCursor };
  }

  async getMessage(messageId: string, userId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata) throw new NotFoundException('Message introuvable');

    if (!(await this.chatService.isMember(metadata.groupId, userId))) {
      throw new ForbiddenException('Vous n\'êtes pas membre de ce groupe');
    }

    const mongo = await this.messageModel
      .findOne({ pg_message_id: messageId })
      .lean();
    const groupKey = await this.getGroupKey(metadata.groupId);

    return this.toPlainMessage(mongo, metadata, groupKey);
  }

  // ── Edit ────────────────────────────────────────────────

  async editMessage(messageId: string, userId: string, newContent: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');
    if (metadata.senderId !== userId)
      throw new ForbiddenException('Seul l\'expéditeur peut modifier son message');

    const mongo = await this.messageModel.findOne({ pg_message_id: messageId });
    if (!mongo) throw new NotFoundException('Contenu introuvable');

    const groupKey = await this.getGroupKey(metadata.groupId);
    if (!groupKey) throw new Error('Clé de groupe introuvable');

    // Re-encrypt with new IV
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGO, groupKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(newContent, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    mongo.content_encrypted = encrypted.toString('base64');
    mongo.iv = iv.toString('base64');
    mongo.auth_tag = authTag.toString('base64');
    mongo.edited_at = new Date();
    await mongo.save();

    metadata.editedAt = new Date();
    await this.msgRepo.save(metadata);

    return this.toPlainMessage(mongo, metadata, groupKey);
  }

  // ── Soft delete ─────────────────────────────────────────

  async softDeleteMessage(messageId: string, userId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');

    const isAdmin = await this.chatService.isMember(metadata.groupId, userId);
    if (metadata.senderId !== userId) {
      // Check if user is admin of the group
      const membership = await this.chatService.getMembers(metadata.groupId);
      const userMembership = membership.find((m) => m.userId === userId);
      if (!userMembership || userMembership.roleInGroup !== 'admin') {
        throw new ForbiddenException('Permission insuffisante');
      }
    }

    metadata.isDeleted = true;
    metadata.deletedAt = new Date();
    await this.msgRepo.save(metadata);

    const mongo = await this.messageModel.findOne({ pg_message_id: messageId });
    if (mongo) {
      mongo.deleted_at = new Date();
      await mongo.save();
    }

    return { deleted: true, message_id: messageId };
  }

  /**
   * Admin/moderator soft-delete — bypasses group membership.
   * Marks the message as deleted and records the moderator who deleted it.
   */
  async softDeleteMessageAsModerator(messageId: string, moderatorId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata) throw new NotFoundException('Message introuvable');

    metadata.isDeleted = true;
    metadata.deletedAt = new Date();
    metadata.deletedByModeratorId = moderatorId;
    await this.msgRepo.save(metadata);

    const mongo = await this.messageModel.findOne({ pg_message_id: messageId });
    if (mongo) {
      mongo.deleted_at = new Date();
      await mongo.save();
    }

    return { deleted: true, message_id: messageId, by: 'moderator' };
  }

  /**
   * Admin/moderator group history — bypasses group membership.
   * Same cursor-based pagination as getMessages, without the membership check.
   */
  async getMessagesAsAdmin(
    groupId: string,
    cursor?: string,
    limit = MESSAGES_PER_PAGE,
  ) {
    // Verify group exists
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || group.deletedAt) throw new NotFoundException('Groupe introuvable');

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.groupId = :groupId', { groupId })
      .andWhere('m.isDeleted = false')
      .orderBy('m.sentAt', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(Buffer.from(cursor, 'base64').toString('utf-8'));
      qb.andWhere('m.sentAt < :cursor', { cursor: cursorDate });
    }

    const metadata = await qb.getMany();
    const hasMore = metadata.length > limit;
    if (hasMore) metadata.pop();

    const mongoIds = metadata.map((m) => m.mongoMessageId);
    const mongoDocs = await this.messageModel
      .find({ pg_message_id: { $in: mongoIds } })
      .lean();

    const groupKey = await this.getGroupKey(groupId);
    const messages = metadata.map((pg) => {
      const mongo = mongoDocs.find((d) => d.pg_message_id === pg.id);
      return this.toPlainMessage(mongo ?? null, pg, groupKey, true);
    });

    const nextCursor =
      hasMore && metadata.length > 0
        ? Buffer.from(metadata[metadata.length - 1].sentAt.toISOString()).toString('base64')
        : undefined;

    return { messages, has_more: hasMore, cursor: nextCursor };
  }

  /**
   * Admin/moderator message read — bypasses group membership.
   * Returns the full decrypted message.
   */
  async getMessageAsAdmin(messageId: string) {
    const metadata = await this.msgRepo.findOne({
      where: { id: messageId },
      relations: ['sender'],
    });
    if (!metadata) throw new NotFoundException('Message introuvable');

    const mongo = await this.messageModel.findOne({ pg_message_id: messageId });

    const groupKey = await this.getGroupKey(metadata.groupId);
    if (!groupKey) throw new NotFoundException('Clé de chiffrement introuvable');

    return this.toPlainMessage(mongo, metadata, groupKey, true);
  }

  // ── Read receipts ───────────────────────────────────────

  async markRead(messageId: string, userId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata) throw new NotFoundException('Message introuvable');

    await this.receiptRepo.upsert(
      this.receiptRepo.create({ messageId, userId, readAt: new Date() }),
      ['messageId', 'userId'],
    );
    return { message_id: messageId, user_id: userId, read: true };
  }

  // ── AES Key management ──────────────────────────────────

  /** Encrypts a group key for safe storage in PostgreSQL. */
  private encryptGroupKeyForStorage(rawKey: Buffer): { encrypted: string; iv: string; authTag: string } {
    const masterKey = Buffer.from(this.configService.get<string>('AES_MASTER_KEY')!, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGO, masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(rawKey), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /** Decrypts a group key retrieved from PostgreSQL. */
  private decryptStoredGroupKey(encryptedB64: string, ivB64: string, authTagB64: string): Buffer {
    const masterKey = Buffer.from(this.configService.get<string>('AES_MASTER_KEY')!, 'hex');
    const decipher = crypto.createDecipheriv(AES_ALGO, masterKey, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]);
  }

  /**
   * Fetches or creates the AES-256 group key.
   * 1. Try Redis (fast path)
   * 2. Fall back to PostgreSQL (encrypted copy)
   * 3. If neither exists, generate new key — store in Redis AND PG
   */
  private async getOrCreateGroupKey(groupId: string): Promise<Buffer> {
    const redisKey = `group_key:${groupId}`;

    // 1. Redis fast path
    const fromRedis = await this.redis.get(redisKey);
    if (fromRedis) return Buffer.from(fromRedis, 'base64');

    // 2. Fall back to PostgreSQL
    const fromDb = await this.getGroupKeyFromDb(groupId);
    if (fromDb) {
      // Restore to Redis so next read hits the fast path
      await this.redis.set(redisKey, fromDb.toString('base64'), 'EX', GROUP_KEY_CACHE_TTL);
      return fromDb;
    }

    // 3. Generate new key — store in both places
    const newKey = crypto.randomBytes(32);
    const packed = this.encryptGroupKeyForStorage(newKey);
    await this.groupRepo.update(
      { id: groupId },
      { encryptedGroupKey: `${packed.iv}:${packed.authTag}:${packed.encrypted}` },
    );
    await this.redis.set(redisKey, newKey.toString('base64'), 'EX', GROUP_KEY_CACHE_TTL);
    return newKey;
  }

  /** Tries to fetch and decrypt the group key from the chat_groups table. */
  private async getGroupKeyFromDb(groupId: string): Promise<Buffer | null> {
    try {
      const group = await this.groupRepo.findOne({
        where: { id: groupId },
        select: ['encryptedGroupKey'],
      });
      if (!group?.encryptedGroupKey) return null;

      const [iv, authTag, encrypted] = group.encryptedGroupKey.split(':');
      if (!iv || !authTag || !encrypted) return null;

      return this.decryptStoredGroupKey(encrypted, iv, authTag);
    } catch {
      return null;
    }
  }

  private async getGroupKey(groupId: string): Promise<Buffer | null> {
    const redisKey = `group_key:${groupId}`;

    // 1. Redis fast path
    const fromRedis = await this.redis.get(redisKey);
    if (fromRedis) return Buffer.from(fromRedis, 'base64');

    // 2. Fall back to PostgreSQL + restore to Redis
    const fromDb = await this.getGroupKeyFromDb(groupId);
    if (fromDb) {
      await this.redis.set(redisKey, fromDb.toString('base64'), 'EX', GROUP_KEY_CACHE_TTL);
      return fromDb;
    }

    return null;
  }

  private decryptContent(
    contentEncrypted: string,
    iv: string,
    authTag: string,
    key: Buffer,
  ): string | null {
    try {
      const decipher = crypto.createDecipheriv(
        AES_ALGO,
        key,
        Buffer.from(iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(authTag, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(contentEncrypted, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf-8');
    } catch {
      return null; // decryption failed
    }
  }

  private toPlainMessage(
    mongo: any,
    pg: MessageMetadata,
    key: Buffer | null | undefined,
    asAdmin = false,
  ) {
    const decrypted =
      key && mongo && mongo.content_encrypted
        ? this.decryptContent(
            mongo.content_encrypted,
            mongo.iv,
            mongo.auth_tag,
            key,
          )
        : null;

    return {
      id: pg.id,
      group_id: pg.groupId,
      sender_id: pg.senderId,
      content: decrypted,
      type: mongo?.type ?? 'text',
      sent_at: pg.sentAt,
      edited_at: mongo?.edited_at ?? null,
      is_deleted: pg.isDeleted,
      deleted_at: pg.deletedAt ?? null,
      ...(asAdmin && { deleted_by_moderator_id: pg.deletedByModeratorId }),
      reactions: mongo?.reactions ?? [],
      attachments: mongo?.attachments ?? [],
    };
  }
}
