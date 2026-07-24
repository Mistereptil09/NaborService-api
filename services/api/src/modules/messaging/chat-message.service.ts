import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { In, MoreThan, Repository } from 'typeorm';
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
import {
  MediaFile,
  MediaFileDocument,
} from '../media/schemas/media-file.schema';
import { MediaService } from '../media/services/media.service';
import { User } from '../users/entities/user.entity';
import { ChatGroupTypeEnum, GroupRoleEnum } from '../../common/enums';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

export interface AttachmentDto {
  media_id: string;
  filename: string;
  mimetype: string;
  size_bytes: number;
  duration_seconds?: number | null;
}

export interface SenderDto {
  id: string;
  first_name: string | null;
  last_name: string | null;
  profile_picture_mongo_id: string | null;
}

export interface ParentMessagePreviewDto {
  id: string;
  sender_id: string;
  sender: SenderDto | null;
  content: string | null;
  is_deleted: boolean;
}

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
    @InjectModel(MediaFile.name)
    private readonly mediaFileModel: Model<MediaFileDocument>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly chatService: ChatService,
    private readonly configService: ConfigService,
    private readonly mediaService: MediaService,
  ) {}

  async sendMessage(groupId: string, senderId: string, dto: SendMessageDto) {
    await this.chatService.assertCanParticipate(groupId, senderId);
    let parent: MessageMetadata | null = null;
    if (dto.parent_message_id) {
      parent = await this.msgRepo.findOne({
        where: { id: dto.parent_message_id },
      });
      if (!parent || parent.groupId !== groupId) {
        throw new NotFoundException(
          'Message parent introuvable dans ce groupe',
        );
      }
    }

    const groupKey = await this.getOrCreateGroupKey(groupId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGO, groupKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(dto.content, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const messageId = crypto.randomUUID();

    const mongoMsg = await this.messageModel.create({
      pg_message_id: messageId,
      pg_group_id: groupId,
      pg_sender_id: senderId,
      content_encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      auth_tag: authTag.toString('base64'),
      type: dto.type,
      poll_id: dto.poll_id ?? null,
      attachments: [],
      reactions: [],
      sent_at: new Date(),
    });

    const metadata = this.msgRepo.create({
      id: messageId,
      mongoMessageId: messageId,
      groupId,
      senderId,
      sentAt: new Date(),
      parentMessageId: dto.parent_message_id ?? null,
      pollId: dto.poll_id ?? null,
    });
    await this.msgRepo.save(metadata);

    const sender = await this.buildSenderDto(senderId);
    const parentMessage = parent
      ? await this.buildParentPreview(parent, groupKey)
      : null;

    return this.toPlainMessage(mongoMsg, metadata, groupKey, {
      sender,
      parentMessage,
    });
  }

  async postSystemMessage(
    groupId: string,
    authoredBy: string,
    event: string,
    payload: Record<string, any>,
  ) {
    const groupKey = await this.getOrCreateGroupKey(groupId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(AES_ALGO, groupKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(event, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const messageId = crypto.randomUUID();

    const mongoMsg = await this.messageModel.create({
      pg_message_id: messageId,
      pg_group_id: groupId,
      pg_sender_id: authoredBy,
      content_encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      auth_tag: authTag.toString('base64'),
      type: 'system',
      system_event: event,
      system_payload: payload,
      poll_id: null,
      attachments: [],
      reactions: [],
      sent_at: new Date(),
    });

    const metadata = this.msgRepo.create({
      id: messageId,
      mongoMessageId: messageId,
      groupId,
      senderId: authoredBy,
      sentAt: new Date(),
    });
    await this.msgRepo.save(metadata);

    const sender = await this.buildSenderDto(authoredBy);

    return this.toPlainMessage(mongoMsg, metadata, groupKey, { sender });
  }

  private async getAttachmentsMap(
    messageIds: string[],
  ): Promise<Map<string, AttachmentDto[]>> {
    const map = new Map<string, AttachmentDto[]>();
    if (messageIds.length === 0) return map;

    const docs = await this.mediaFileModel
      .find({ owner_type: 'message_attachment', owner_id: { $in: messageIds } })
      .lean();
    for (const doc of docs) {
      const list = map.get(doc.owner_id) ?? [];
      list.push({
        media_id: doc._id.toString(),
        filename: doc.original_filename,
        mimetype: doc.mimetype,
        size_bytes: doc.size_bytes,
        duration_seconds: doc.duration_seconds ?? null,
      });
      map.set(doc.owner_id, list);
    }
    return map;
  }

  async getMessages(
    groupId: string,
    userId: string,
    cursor?: string,
    limit = MESSAGES_PER_PAGE,
    aroundMessageId?: string,
    direction: 'older' | 'newer' = 'older',
  ) {
    if (!(await this.chatService.isMember(groupId, userId))) {
      throw new ForbiddenException("Vous n'êtes pas membre de ce groupe");
    }

    let aroundTimestamp: Date | null = null;
    if (aroundMessageId) {
      const target = await this.msgRepo.findOne({
        where: { id: aroundMessageId, groupId },
      });
      if (!target) throw new NotFoundException('Message introuvable');
      aroundTimestamp = target.sentAt;
    }

    const fetchingNewer =
      direction === 'newer' && !aroundTimestamp && Boolean(cursor);

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.groupId = :groupId', { groupId })
      .andWhere('m.isDeleted = false')
      .take(limit + 1);

    if (aroundTimestamp) {
      qb.orderBy('m.sentAt', 'DESC').andWhere('m.sentAt <= :around', {
        around: aroundTimestamp,
      });
    } else if (fetchingNewer) {
      const cursorDate = new Date(
        Buffer.from(cursor!, 'base64').toString('utf-8'),
      );
      qb.orderBy('m.sentAt', 'ASC').andWhere('m.sentAt > :cursor', {
        cursor: cursorDate,
      });
    } else {
      qb.orderBy('m.sentAt', 'DESC');
      if (cursor) {
        const cursorDate = new Date(
          Buffer.from(cursor, 'base64').toString('utf-8'),
        );
        qb.andWhere('m.sentAt < :cursor', { cursor: cursorDate });
      }
    }

    const metadata = await qb.getMany();
    const hasExtra = metadata.length > limit;
    if (hasExtra) metadata.pop();
    if (fetchingNewer) metadata.reverse();

    const mongoIds = metadata.map((m) => m.mongoMessageId);
    const mongoDocs = await this.messageModel
      .find({ pg_message_id: { $in: mongoIds } })
      .lean();

    const groupKey = await this.getGroupKey(groupId);
    const attachmentsMap = await this.getAttachmentsMap(
      metadata.map((m) => m.id),
    );
    const { usersMap, parentsById, parentMongoById } =
      await this.buildListEnrichment(metadata);
    const messages = metadata.map((pg) => {
      const mongo = mongoDocs.find((d) => d.pg_message_id === pg.id);
      return this.toPlainMessage(mongo ?? null, pg, groupKey, {
        attachments: attachmentsMap.get(pg.id) ?? [],
        sender: usersMap.get(pg.senderId) ?? null,
        parentMessage: pg.parentMessageId
          ? this.buildParentPreviewFromMaps(
              pg.parentMessageId,
              groupKey,
              parentsById,
              parentMongoById,
              usersMap,
            )
          : null,
      });
    });

    const encode = (d: Date) => Buffer.from(d.toISOString()).toString('base64');
    const oldestInBatch = metadata[metadata.length - 1]?.sentAt;
    const newestInBatch = metadata[0]?.sentAt;

    const hasMoreOlder = fetchingNewer ? false : hasExtra;
    const cursorOut =
      hasMoreOlder && oldestInBatch ? encode(oldestInBatch) : undefined;

    const needsNewerInfo = Boolean(aroundTimestamp) || fetchingNewer;
    const hasMoreNewer =
      needsNewerInfo && newestInBatch
        ? fetchingNewer
          ? hasExtra
          : await this.msgRepo.exists({
              where: {
                groupId,
                isDeleted: false,
                sentAt: MoreThan(newestInBatch),
              },
            })
        : false;
    const newerCursorOut =
      hasMoreNewer && newestInBatch ? encode(newestInBatch) : undefined;

    return {
      messages,
      has_more: hasMoreOlder,
      cursor: cursorOut,
      has_more_newer: hasMoreNewer,
      newer_cursor: newerCursorOut,
    };
  }

  async getPinnedMessages(groupId: string, userId: string) {
    if (!(await this.chatService.isMember(groupId, userId))) {
      throw new ForbiddenException("Vous n'êtes pas membre de ce groupe");
    }

    const metadata = await this.msgRepo.find({
      where: { groupId, isDeleted: false, pinned: true },
      order: { pinnedAt: 'DESC' },
    });
    if (metadata.length === 0) return { messages: [] };

    const mongoIds = metadata.map((m) => m.mongoMessageId);
    const mongoDocs = await this.messageModel
      .find({ pg_message_id: { $in: mongoIds } })
      .lean();

    const groupKey = await this.getGroupKey(groupId);
    const attachmentsMap = await this.getAttachmentsMap(
      metadata.map((m) => m.id),
    );
    const usersMap = await this.getUsersMap(metadata.map((m) => m.senderId));
    const messages = metadata.map((pg) => {
      const mongo = mongoDocs.find((d) => d.pg_message_id === pg.id);
      return this.toPlainMessage(mongo ?? null, pg, groupKey, {
        attachments: attachmentsMap.get(pg.id) ?? [],
        sender: usersMap.get(pg.senderId) ?? null,
      });
    });

    return { messages };
  }

  async getGroupAttachments(groupId: string, userId: string) {
    if (!(await this.chatService.isMember(groupId, userId))) {
      throw new ForbiddenException("Vous n'êtes pas membre de ce groupe");
    }

    const metadata = await this.msgRepo.find({
      where: { groupId, isDeleted: false },
      select: ['id', 'senderId', 'sentAt'],
    });
    if (metadata.length === 0) return { attachments: [] };

    const messageById = new Map(metadata.map((m) => [m.id, m]));
    const docs = await this.mediaFileModel
      .find({
        owner_type: 'message_attachment',
        owner_id: { $in: metadata.map((m) => m.id) },
      })
      .sort({ uploaded_at: -1 })
      .lean();

    const attachments = docs.map((doc) => {
      const msg = messageById.get(doc.owner_id);
      return {
        message_id: doc.owner_id,
        sender_id: msg?.senderId ?? null,
        sent_at: msg?.sentAt ?? null,
        media_id: doc._id.toString(),
        filename: doc.original_filename,
        mimetype: doc.mimetype,
        size_bytes: doc.size_bytes,
        uploaded_at: doc.uploaded_at,
      };
    });

    return { attachments };
  }

  async getMessage(messageId: string, userId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata) throw new NotFoundException('Message introuvable');

    if (!(await this.chatService.isMember(metadata.groupId, userId))) {
      throw new ForbiddenException("Vous n'êtes pas membre de ce groupe");
    }

    const mongo = await this.messageModel
      .findOne({ pg_message_id: messageId })
      .lean();
    const groupKey = await this.getGroupKey(metadata.groupId);
    const attachments =
      (await this.getAttachmentsMap([messageId])).get(messageId) ?? [];
    const sender = await this.buildSenderDto(metadata.senderId);
    const parentMessage = await this.getSingleParentPreview(
      metadata.parentMessageId,
      groupKey,
    );

    return this.toPlainMessage(mongo, metadata, groupKey, {
      attachments,
      sender,
      parentMessage,
    });
  }

  async editMessage(messageId: string, userId: string, newContent: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');
    if (metadata.senderId !== userId)
      throw new ForbiddenException(
        "Seul l'expéditeur peut modifier son message",
      );

    const mongo = await this.messageModel.findOne({ pg_message_id: messageId });
    if (!mongo) throw new NotFoundException('Contenu introuvable');

    const groupKey = await this.getGroupKey(metadata.groupId);
    if (!groupKey) throw new Error('Clé de groupe introuvable');

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

    const attachments =
      (await this.getAttachmentsMap([messageId])).get(messageId) ?? [];
    const sender = await this.buildSenderDto(metadata.senderId);
    const parentMessage = await this.getSingleParentPreview(
      metadata.parentMessageId,
      groupKey,
    );
    return this.toPlainMessage(mongo, metadata, groupKey, {
      attachments,
      sender,
      parentMessage,
    });
  }

  async setReaction(messageId: string, userId: string, emoji: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');
    await this.chatService.assertCanParticipate(metadata.groupId, userId);

    await this.messageModel.updateOne(
      { pg_message_id: messageId },
      { $pull: { reactions: { pg_user_id: userId } } },
    );
    await this.messageModel.updateOne(
      { pg_message_id: messageId },
      {
        $push: {
          reactions: { pg_user_id: userId, emoji, reacted_at: new Date() },
        },
      },
    );

    const mongo = await this.messageModel
      .findOne({ pg_message_id: messageId })
      .lean();
    return {
      group_id: metadata.groupId,
      message_id: messageId,
      reactions: mongo?.reactions ?? [],
    };
  }

  async removeReaction(messageId: string, userId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');
    await this.chatService.assertCanParticipate(metadata.groupId, userId);

    await this.messageModel.updateOne(
      { pg_message_id: messageId },
      { $pull: { reactions: { pg_user_id: userId } } },
    );

    const mongo = await this.messageModel
      .findOne({ pg_message_id: messageId })
      .lean();
    return {
      group_id: metadata.groupId,
      message_id: messageId,
      reactions: mongo?.reactions ?? [],
    };
  }

  async pinMessage(messageId: string, userId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');
    await this.assertCanPin(metadata.groupId, userId);

    metadata.pinned = true;
    metadata.pinnedAt = new Date();
    metadata.pinnedById = userId;
    await this.msgRepo.save(metadata);

    return this.getMessage(messageId, userId);
  }

  async unpinMessage(messageId: string, userId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');
    await this.assertCanPin(metadata.groupId, userId);

    metadata.pinned = false;
    metadata.pinnedAt = null;
    metadata.pinnedById = null;
    await this.msgRepo.save(metadata);

    return this.getMessage(messageId, userId);
  }

  private async assertCanPin(groupId: string, userId: string): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (group?.type === ChatGroupTypeEnum.DIRECT_MESSAGE) {
      if (!(await this.chatService.isMember(groupId, userId))) {
        throw new ForbiddenException(
          "Vous n'êtes pas membre de cette conversation",
        );
      }
      return;
    }
    await this.chatService.assertGroupRole(groupId, userId, [
      GroupRoleEnum.ACTIONS,
      GroupRoleEnum.ADMIN,
    ]);
  }

  async softDeleteMessage(messageId: string, userId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');

    const isAdmin = await this.chatService.isMember(metadata.groupId, userId);
    if (metadata.senderId !== userId) {
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

    await this.deleteAttachments(messageId);

    return { deleted: true, message_id: messageId };
  }

  private async deleteAttachments(messageId: string): Promise<void> {
    const attachments =
      (await this.getAttachmentsMap([messageId])).get(messageId) ?? [];
    await Promise.all(
      attachments.map((att) =>
        this.mediaService.delete(att.media_id).catch(() => undefined),
      ),
    );
  }

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

    await this.deleteAttachments(messageId);

    return { deleted: true, message_id: messageId, by: 'moderator' };
  }

  async getMessagesAsAdmin(
    groupId: string,
    cursor?: string,
    limit = MESSAGES_PER_PAGE,
  ) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || group.deletedAt)
      throw new NotFoundException('Groupe introuvable');

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.groupId = :groupId', { groupId })
      .andWhere('m.isDeleted = false')
      .orderBy('m.sentAt', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const cursorDate = new Date(
        Buffer.from(cursor, 'base64').toString('utf-8'),
      );
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
    const attachmentsMap = await this.getAttachmentsMap(
      metadata.map((m) => m.id),
    );
    const { usersMap, parentsById, parentMongoById } =
      await this.buildListEnrichment(metadata);
    const messages = metadata.map((pg) => {
      const mongo = mongoDocs.find((d) => d.pg_message_id === pg.id);
      return this.toPlainMessage(mongo ?? null, pg, groupKey, {
        asAdmin: true,
        attachments: attachmentsMap.get(pg.id) ?? [],
        sender: usersMap.get(pg.senderId) ?? null,
        parentMessage: pg.parentMessageId
          ? this.buildParentPreviewFromMaps(
              pg.parentMessageId,
              groupKey,
              parentsById,
              parentMongoById,
              usersMap,
            )
          : null,
      });
    });

    const nextCursor =
      hasMore && metadata.length > 0
        ? Buffer.from(
            metadata[metadata.length - 1].sentAt.toISOString(),
          ).toString('base64')
        : undefined;

    return { messages, has_more: hasMore, cursor: nextCursor };
  }

  async getMessageAsAdmin(messageId: string) {
    const metadata = await this.msgRepo.findOne({
      where: { id: messageId },
      relations: ['sender'],
    });
    if (!metadata) throw new NotFoundException('Message introuvable');

    const mongo = await this.messageModel.findOne({ pg_message_id: messageId });

    const groupKey = await this.getGroupKey(metadata.groupId);
    if (!groupKey)
      throw new NotFoundException('Clé de chiffrement introuvable');

    const attachments =
      (await this.getAttachmentsMap([messageId])).get(messageId) ?? [];
    const sender = await this.buildSenderDto(metadata.senderId);
    const parentMessage = await this.getSingleParentPreview(
      metadata.parentMessageId,
      groupKey,
    );
    return this.toPlainMessage(mongo, metadata, groupKey, {
      asAdmin: true,
      attachments,
      sender,
      parentMessage,
    });
  }

  async getGroupAttachmentsAsAdmin(groupId: string) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || group.deletedAt)
      throw new NotFoundException('Groupe introuvable');

    const metadata = await this.msgRepo.find({
      where: { groupId, isDeleted: false },
      select: ['id', 'senderId', 'sentAt'],
    });
    if (metadata.length === 0) return { attachments: [] };

    const messageById = new Map(metadata.map((m) => [m.id, m]));
    const docs = await this.mediaFileModel
      .find({
        owner_type: 'message_attachment',
        owner_id: { $in: metadata.map((m) => m.id) },
      })
      .sort({ uploaded_at: -1 })
      .lean();

    const attachments = docs.map((doc) => {
      const msg = messageById.get(doc.owner_id);
      return {
        message_id: doc.owner_id,
        sender_id: msg?.senderId ?? null,
        sent_at: msg?.sentAt ?? null,
        media_id: doc._id.toString(),
        filename: doc.original_filename,
        mimetype: doc.mimetype,
        size_bytes: doc.size_bytes,
        uploaded_at: doc.uploaded_at,
      };
    });

    return { attachments };
  }

  async getPinnedMessagesAsAdmin(groupId: string) {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group || group.deletedAt)
      throw new NotFoundException('Groupe introuvable');

    const metadata = await this.msgRepo.find({
      where: { groupId, isDeleted: false, pinned: true },
      order: { pinnedAt: 'DESC' },
    });
    if (metadata.length === 0) return { messages: [] };

    const mongoIds = metadata.map((m) => m.mongoMessageId);
    const mongoDocs = await this.messageModel
      .find({ pg_message_id: { $in: mongoIds } })
      .lean();

    const groupKey = await this.getGroupKey(groupId);
    const attachmentsMap = await this.getAttachmentsMap(
      metadata.map((m) => m.id),
    );
    const usersMap = await this.getUsersMap(metadata.map((m) => m.senderId));
    const messages = metadata.map((pg) => {
      const mongo = mongoDocs.find((d) => d.pg_message_id === pg.id);
      return this.toPlainMessage(mongo ?? null, pg, groupKey, {
        asAdmin: true,
        attachments: attachmentsMap.get(pg.id) ?? [],
        sender: usersMap.get(pg.senderId) ?? null,
      });
    });
    return { messages };
  }

  async editMessageAsModerator(messageId: string, newContent: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');

    const mongo = await this.messageModel.findOne({ pg_message_id: messageId });
    if (!mongo) throw new NotFoundException('Contenu introuvable');

    const groupKey = await this.getGroupKey(metadata.groupId);
    if (!groupKey)
      throw new NotFoundException('Clé de chiffrement introuvable');

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

    return this.getMessageAsAdmin(messageId);
  }

  async pinMessageAsModerator(messageId: string, moderatorId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');
    metadata.pinned = true;
    metadata.pinnedAt = new Date();
    metadata.pinnedById = moderatorId;
    await this.msgRepo.save(metadata);
    return this.getMessageAsAdmin(messageId);
  }

  async unpinMessageAsModerator(messageId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata || metadata.isDeleted)
      throw new NotFoundException('Message introuvable');
    metadata.pinned = false;
    metadata.pinnedAt = null;
    metadata.pinnedById = null;
    await this.msgRepo.save(metadata);
    return this.getMessageAsAdmin(messageId);
  }

  async markRead(messageId: string, userId: string) {
    const metadata = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!metadata) throw new NotFoundException('Message introuvable');

    await this.receiptRepo.upsert(
      this.receiptRepo.create({ messageId, userId, readAt: new Date() }),
      ['messageId', 'userId'],
    );
    return { message_id: messageId, user_id: userId, read: true };
  }

  private encryptGroupKeyForStorage(rawKey: Buffer): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    const masterKey = Buffer.from(
      this.configService.get<string>('AES_MASTER_KEY')!,
      'hex',
    );
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

  private decryptStoredGroupKey(
    encryptedB64: string,
    ivB64: string,
    authTagB64: string,
  ): Buffer {
    const masterKey = Buffer.from(
      this.configService.get<string>('AES_MASTER_KEY')!,
      'hex',
    );
    const decipher = crypto.createDecipheriv(
      AES_ALGO,
      masterKey,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, 'base64')),
      decipher.final(),
    ]);
  }

  private async getOrCreateGroupKey(groupId: string): Promise<Buffer> {
    const redisKey = `group_key:${groupId}`;

    const fromRedis = await this.redis.get(redisKey);
    if (fromRedis) return Buffer.from(fromRedis, 'base64');

    const fromDb = await this.getGroupKeyFromDb(groupId);
    if (fromDb) {
      await this.redis.set(
        redisKey,
        fromDb.toString('base64'),
        'EX',
        GROUP_KEY_CACHE_TTL,
      );
      return fromDb;
    }

    const newKey = crypto.randomBytes(32);
    const packed = this.encryptGroupKeyForStorage(newKey);
    await this.groupRepo.update(
      { id: groupId },
      {
        encryptedGroupKey: `${packed.iv}:${packed.authTag}:${packed.encrypted}`,
      },
    );
    await this.redis.set(
      redisKey,
      newKey.toString('base64'),
      'EX',
      GROUP_KEY_CACHE_TTL,
    );
    return newKey;
  }

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

    const fromRedis = await this.redis.get(redisKey);
    if (fromRedis) return Buffer.from(fromRedis, 'base64');

    const fromDb = await this.getGroupKeyFromDb(groupId);
    if (fromDb) {
      await this.redis.set(
        redisKey,
        fromDb.toString('base64'),
        'EX',
        GROUP_KEY_CACHE_TTL,
      );
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
    opts: {
      asAdmin?: boolean;
      attachments?: AttachmentDto[];
      sender?: SenderDto | null;
      parentMessage?: ParentMessagePreviewDto | null;
    } = {},
  ) {
    const {
      asAdmin = false,
      attachments = [],
      sender = null,
      parentMessage = null,
    } = opts;
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
      sender,
      content: decrypted,
      type: mongo?.type ?? 'text',
      sent_at: pg.sentAt,
      edited_at: mongo?.edited_at ?? null,
      is_deleted: pg.isDeleted,
      deleted_at: pg.deletedAt ?? null,
      parent_message_id: pg.parentMessageId ?? null,
      parent_message: parentMessage,
      ...(asAdmin && { deleted_by_moderator_id: pg.deletedByModeratorId }),
      reactions: mongo?.reactions ?? [],
      attachments,
      poll_id: pg.pollId ?? null,
      system_event: mongo?.system_event ?? null,
      system_payload: mongo?.system_payload ?? null,
      pinned: pg.pinned,
      pinned_at: pg.pinnedAt ?? null,
      pinned_by: pg.pinnedById ?? null,
    };
  }

  private async buildSenderDto(userId: string): Promise<SenderDto | null> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return null;
    return {
      id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      profile_picture_mongo_id: user.profilePictureMongoId,
    };
  }

  private async getUsersMap(
    userIds: string[],
  ): Promise<Map<string, SenderDto>> {
    const map = new Map<string, SenderDto>();
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return map;
    const users = await this.userRepo.find({ where: { id: In(unique) } });
    for (const u of users) {
      map.set(u.id, {
        id: u.id,
        first_name: u.firstName,
        last_name: u.lastName,
        profile_picture_mongo_id: u.profilePictureMongoId,
      });
    }
    return map;
  }

  private async getSingleParentPreview(
    parentMessageId: string | null,
    groupKey: Buffer | null,
  ): Promise<ParentMessagePreviewDto | null> {
    if (!parentMessageId) return null;
    const parent = await this.msgRepo.findOne({
      where: { id: parentMessageId },
    });
    if (!parent) return null;
    return this.buildParentPreview(parent, groupKey);
  }

  private async buildParentPreview(
    parent: MessageMetadata,
    groupKey: Buffer | null,
  ): Promise<ParentMessagePreviewDto> {
    const mongo = await this.messageModel
      .findOne({ pg_message_id: parent.id })
      .lean();
    const sender = await this.buildSenderDto(parent.senderId);
    const content =
      !parent.isDeleted && groupKey && mongo?.content_encrypted
        ? this.decryptContent(
            mongo.content_encrypted,
            mongo.iv,
            mongo.auth_tag,
            groupKey,
          )
        : null;
    return {
      id: parent.id,
      sender_id: parent.senderId,
      sender,
      content,
      is_deleted: parent.isDeleted,
    };
  }

  private async buildListEnrichment(metadata: MessageMetadata[]): Promise<{
    usersMap: Map<string, SenderDto>;
    parentsById: Map<string, MessageMetadata>;
    parentMongoById: Map<string, any>;
  }> {
    const parentIds = [
      ...new Set(
        metadata
          .filter(
            (m): m is MessageMetadata & { parentMessageId: string } =>
              !!m.parentMessageId,
          )
          .map((m) => m.parentMessageId),
      ),
    ];
    const parents = parentIds.length
      ? await this.msgRepo.find({ where: { id: In(parentIds) } })
      : [];
    const parentMongoDocs = parentIds.length
      ? await this.messageModel
          .find({ pg_message_id: { $in: parentIds } })
          .lean()
      : [];

    const senderIds = [
      ...metadata.map((m) => m.senderId),
      ...parents.map((p) => p.senderId),
    ];
    const usersMap = await this.getUsersMap(senderIds);

    return {
      usersMap,
      parentsById: new Map(parents.map((p) => [p.id, p])),
      parentMongoById: new Map(
        parentMongoDocs.map((d: any) => [d.pg_message_id, d]),
      ),
    };
  }

  private buildParentPreviewFromMaps(
    parentId: string,
    groupKey: Buffer | null,
    parentsById: Map<string, MessageMetadata>,
    parentMongoById: Map<string, any>,
    usersMap: Map<string, SenderDto>,
  ): ParentMessagePreviewDto | null {
    const parent = parentsById.get(parentId);
    if (!parent) return null;
    const mongo = parentMongoById.get(parent.id);
    const content =
      !parent.isDeleted && groupKey && mongo?.content_encrypted
        ? this.decryptContent(
            mongo.content_encrypted,
            mongo.iv,
            mongo.auth_tag,
            groupKey,
          )
        : null;
    return {
      id: parent.id,
      sender_id: parent.senderId,
      sender: usersMap.get(parent.senderId) ?? null,
      content,
      is_deleted: parent.isDeleted,
    };
  }
}
