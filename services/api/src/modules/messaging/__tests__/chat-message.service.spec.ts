import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getModelToken } from '@nestjs/mongoose';
import { ChatMessageService } from '../chat-message.service';
import { ChatService } from '../chat.service';
import { MediaService } from '../../media/services/media.service';
import { ChatGroup } from '../entities/chat-group.entity';
import { MessageMetadata } from '../entities/message-metadata.entity';
import { MessageReadReceipt } from '../entities/message-read-receipt.entity';
import { User } from '../../users/entities/user.entity';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { ChatGroupTypeEnum } from '../../../common/enums';

describe('ChatMessageService', () => {
  let service: ChatMessageService;
  let mockChatService: any;
  let redis: any;
  let msgRepo: any;
  let receiptRepo: any;
  let groupRepo: any;
  let messageModel: any;
  let mediaFileModel: any;
  let userRepo: any;
  let configService: any;
  let mediaService: any;

  const fakeKey = Buffer.alloc(32, 1).toString('base64'); // deterministic 256-bit key

  const makeMongoMsg = (pgId = 'msg1') => ({
    _id: { toString: () => 'mongo1' },
    pg_message_id: pgId,
    pg_group_id: 'g1',
    pg_sender_id: 'u1',
    content_encrypted: '',
    iv: '',
    auth_tag: '',
    type: 'text',
    attachments: [],
    reactions: [],
    sent_at: new Date(),
    edited_at: null,
    deleted_at: null,
    save: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    redis.get.mockResolvedValue(fakeKey); // group key always available

    mockChatService = {
      isMember: jest.fn().mockResolvedValue(true),
      isMuted: jest.fn().mockResolvedValue(false),
      getMembers: jest.fn().mockResolvedValue([]),
      assertCanParticipate: jest.fn().mockResolvedValue(undefined),
      assertGroupRole: jest.fn().mockResolvedValue(undefined),
    };

    msgRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: dto.id ?? 'msg1', ...dto })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
    };

    receiptRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      upsert: jest.fn().mockResolvedValue(undefined),
    };

    messageModel = {
      create: jest.fn(),
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      updateOne: jest.fn().mockResolvedValue(undefined),
    };

    mediaFileModel = {
      find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    };

    groupRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    userRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };

    configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    };

    mediaService = {
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatMessageService,
        { provide: getRepositoryToken(MessageMetadata), useValue: msgRepo },
        { provide: getRepositoryToken(MessageReadReceipt), useValue: receiptRepo },
        { provide: getRepositoryToken(ChatGroup), useValue: groupRepo },
        { provide: getModelToken('Message'), useValue: messageModel },
        { provide: getModelToken('MediaFile'), useValue: mediaFileModel },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: ChatService, useValue: mockChatService },
        { provide: ConfigService, useValue: configService },
        { provide: MediaService, useValue: mediaService },
      ],
    }).compile();

    service = module.get(ChatMessageService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  // ── sendMessage ─────────────────────────────────────────

  describe('sendMessage', () => {
    it('should encrypt and round-trip a message', async () => {
      // Mock create to return the encrypted data that was passed in (so decryption works)
      messageModel.create.mockImplementation((dto: any) =>
        Promise.resolve({
          ...makeMongoMsg(),
          content_encrypted: dto.content_encrypted,
          iv: dto.iv,
          auth_tag: dto.auth_tag,
          type: dto.type,
          save: jest.fn().mockResolvedValue(undefined),
        }),
      );

      const msg = await service.sendMessage('g1', 'u1', { content: 'Hello World', type: 'text' });

      expect(msg).toBeDefined();
      expect(msg.content).toBe('Hello World');
      expect(msg.type).toBe('text');
      expect(msg.sender_id).toBe('u1');
      expect(msg.group_id).toBe('g1');
    });

    it('should still allow a muted user to send (mute only silences notifications)', async () => {
      messageModel.create.mockImplementation((dto: any) =>
        Promise.resolve({
          ...makeMongoMsg(),
          content_encrypted: dto.content_encrypted,
          iv: dto.iv,
          auth_tag: dto.auth_tag,
          type: dto.type,
          save: jest.fn().mockResolvedValue(undefined),
        }),
      );
      mockChatService.isMuted.mockResolvedValueOnce(true);
      const msg = await service.sendMessage('g1', 'u1', { content: 'Hi', type: 'text' });
      expect(msg.content).toBe('Hi');
    });

    it('should reject non-member / watch-role member (assertCanParticipate)', async () => {
      mockChatService.assertCanParticipate.mockRejectedValueOnce(new ForbiddenException());
      await expect(
        service.sendMessage('g1', 'u9', { content: 'Hi', type: 'text' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should attach a valid parent_message_id from the same group', async () => {
      msgRepo.findOne.mockResolvedValueOnce({ id: 'parent1', groupId: 'g1' });
      messageModel.create.mockImplementation((dto: any) =>
        Promise.resolve({ ...makeMongoMsg(), ...dto, save: jest.fn().mockResolvedValue(undefined) }),
      );

      await service.sendMessage('g1', 'u1', {
        content: 'Reply', type: 'text', parent_message_id: 'parent1',
      });

      const savedMetadata = msgRepo.create.mock.calls[0][0];
      expect(savedMetadata.parentMessageId).toBe('parent1');
    });

    it('should reject a parent_message_id that does not exist', async () => {
      msgRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.sendMessage('g1', 'u1', { content: 'Reply', type: 'text', parent_message_id: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject a parent_message_id from a different group', async () => {
      msgRepo.findOne.mockResolvedValueOnce({ id: 'parent1', groupId: 'other-group' });
      await expect(
        service.sendMessage('g1', 'u1', { content: 'Reply', type: 'text', parent_message_id: 'parent1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getMessage ──────────────────────────────────────────

  describe('getMessage', () => {
    it('should return a single decrypted message', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false });
      messageModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

      const msg = await service.getMessage('msg1', 'u1');
      expect(msg).toBeDefined();
      expect(msg.id).toBe('msg1');
    });

    it('should reject non-member', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false });
      mockChatService.isMember.mockResolvedValueOnce(false);

      await expect(service.getMessage('msg1', 'u9')).rejects.toThrow(ForbiddenException);
    });

    it('should throw on missing message', async () => {
      msgRepo.findOne.mockResolvedValue(null);
      await expect(service.getMessage('msg99', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getMessages (pagination) ────────────────────────────

  describe('getMessages', () => {
    it('should return paginated results with has_more and cursor', async () => {
      const now = new Date();
      const metadatas = [
        { id: 'm3', groupId: 'g1', senderId: 'u1', sentAt: new Date(now.getTime() - 3000), isDeleted: false, mongoMessageId: 'mongo3' },
        { id: 'm2', groupId: 'g1', senderId: 'u1', sentAt: new Date(now.getTime() - 2000), isDeleted: false, mongoMessageId: 'mongo2' },
        { id: 'm1', groupId: 'g1', senderId: 'u1', sentAt: new Date(now.getTime() - 1000), isDeleted: false, mongoMessageId: 'mongo1' },
      ];

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(metadatas),
      };
      msgRepo.createQueryBuilder.mockReturnValue(qbMock);
      messageModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

      const result = await service.getMessages('g1', 'u1', undefined, 50);
      expect(result.messages).toHaveLength(3);
      expect(result.has_more).toBe(false);
    });

    it('should set has_more when results exceed limit', async () => {
      const metadatas = Array.from({ length: 51 }, (_, i) => ({
        id: `m${i}`, groupId: 'g1', senderId: 'u1',
        sentAt: new Date(Date.now() - i * 1000),
        isDeleted: false, mongoMessageId: `mongo${i}`,
      }));

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(metadatas),
      };
      msgRepo.createQueryBuilder.mockReturnValue(qbMock);
      messageModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

      const result = await service.getMessages('g1', 'u1', undefined, 50);
      expect(result.has_more).toBe(true);
      expect(result.messages).toHaveLength(50);
      expect(result.cursor).toBeDefined();
    });

    it('should reject non-member', async () => {
      mockChatService.isMember.mockResolvedValueOnce(false);
      await expect(service.getMessages('g1', 'u9')).rejects.toThrow(ForbiddenException);
    });

    it('should anchor the page on the target message\'s timestamp when "around" is given (jump-to-message)', async () => {
      const target = { id: 'm5', groupId: 'g1', senderId: 'u1', sentAt: new Date('2026-01-01T10:00:00Z'), isDeleted: false, mongoMessageId: 'mongo5' };
      msgRepo.findOne.mockResolvedValue(target);

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([target]),
      };
      msgRepo.createQueryBuilder.mockReturnValue(qbMock);
      messageModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

      const result = await service.getMessages('g1', 'u1', undefined, 50, 'm5');

      expect(msgRepo.findOne).toHaveBeenCalledWith({ where: { id: 'm5', groupId: 'g1' } });
      expect(qbMock.andWhere).toHaveBeenCalledWith('m.sentAt <= :around', { around: target.sentAt });
      expect(result.messages.map((m: any) => m.id)).toContain('m5');
    });

    it('should 404 when the "around" target message does not exist in the group', async () => {
      msgRepo.findOne.mockResolvedValue(null);
      await expect(
        service.getMessages('g1', 'u1', undefined, 50, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should report has_more_newer on an "around" page when messages exist closer to the present', async () => {
      const target = { id: 'm5', groupId: 'g1', senderId: 'u1', sentAt: new Date('2026-01-01T10:00:00Z'), isDeleted: false, mongoMessageId: 'mongo5' };
      msgRepo.findOne.mockResolvedValue(target);
      msgRepo.exists.mockResolvedValue(true);

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([target]),
      };
      msgRepo.createQueryBuilder.mockReturnValue(qbMock);
      messageModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

      const result = await service.getMessages('g1', 'u1', undefined, 50, 'm5');

      expect(msgRepo.exists).toHaveBeenCalledWith({ where: { groupId: 'g1', isDeleted: false, sentAt: MoreThan(target.sentAt) } });
      expect(result.has_more_newer).toBe(true);
      expect(result.newer_cursor).toBeDefined();
    });

    it('should not check has_more_newer on a plain (non-jump) page — nothing is ever newer than "now"', async () => {
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      msgRepo.createQueryBuilder.mockReturnValue(qbMock);
      messageModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

      const result = await service.getMessages('g1', 'u1', undefined, 50);

      expect(msgRepo.exists).not.toHaveBeenCalled();
      expect(result.has_more_newer).toBe(false);
      expect(result.newer_cursor).toBeUndefined();
    });

    it('should fetch ascending, strictly-after-cursor when direction is "newer" (filling the gap back to live after a jump)', async () => {
      const older = { id: 'm1', groupId: 'g1', senderId: 'u1', sentAt: new Date('2026-01-01T10:00:00Z'), isDeleted: false, mongoMessageId: 'mongo1' };
      const newer = { id: 'm2', groupId: 'g1', senderId: 'u1', sentAt: new Date('2026-01-01T10:01:00Z'), isDeleted: false, mongoMessageId: 'mongo2' };
      const cursor = Buffer.from(new Date('2026-01-01T09:00:00Z').toISOString()).toString('base64');

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        // Renvoyé par la requête ASC (le plus proche du curseur en premier) —
        // le service doit re-trier en DESC avant de construire la page.
        getMany: jest.fn().mockResolvedValue([older, newer]),
      };
      msgRepo.createQueryBuilder.mockReturnValue(qbMock);
      messageModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

      const result = await service.getMessages('g1', 'u1', cursor, 50, undefined, 'newer');

      expect(qbMock.orderBy).toHaveBeenCalledWith('m.sentAt', 'ASC');
      expect(qbMock.andWhere).toHaveBeenCalledWith('m.sentAt > :cursor', { cursor: new Date('2026-01-01T09:00:00Z') });
      expect(result.messages.map((m: any) => m.id)).toEqual(['m2', 'm1']); // remis en DESC (plus récent en tête)
      expect(result.has_more).toBe(false); // jamais consultée pour une page "newer"
    });

    it('should set has_more_newer (not has_more) when a "newer" page is itself truncated by the limit', async () => {
      const metadatas = Array.from({ length: 51 }, (_, i) => ({
        id: `m${i}`, groupId: 'g1', senderId: 'u1',
        sentAt: new Date(Date.parse('2026-01-01T10:00:00Z') + i * 1000),
        isDeleted: false, mongoMessageId: `mongo${i}`,
      }));
      const cursor = Buffer.from(new Date('2026-01-01T09:00:00Z').toISOString()).toString('base64');

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(metadatas),
      };
      msgRepo.createQueryBuilder.mockReturnValue(qbMock);
      messageModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

      const result = await service.getMessages('g1', 'u1', cursor, 50, undefined, 'newer');

      expect(result.messages).toHaveLength(50);
      expect(result.has_more).toBe(false);
      expect(result.has_more_newer).toBe(true);
      expect(result.newer_cursor).toBeDefined();
      expect(msgRepo.exists).not.toHaveBeenCalled(); // truncation alone answers it, no extra query needed
    });
  });

  // ── getPinnedMessages ────────────────────────────────────

  describe('getPinnedMessages', () => {
    it('should return hydrated pinned messages ordered by pinnedAt desc', async () => {
      msgRepo.find = jest.fn().mockResolvedValue([
        { id: 'm2', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false, mongoMessageId: 'mongo2', pinned: true, pinnedAt: new Date() },
      ]);
      messageModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

      const result = await service.getPinnedMessages('g1', 'u1');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('m2');
      expect(msgRepo.find).toHaveBeenCalledWith({
        where: { groupId: 'g1', isDeleted: false, pinned: true },
        order: { pinnedAt: 'DESC' },
      });
    });

    it('should return an empty list without querying Mongo when nothing is pinned', async () => {
      msgRepo.find = jest.fn().mockResolvedValue([]);
      const result = await service.getPinnedMessages('g1', 'u1');
      expect(result.messages).toEqual([]);
      expect(messageModel.find).not.toHaveBeenCalled();
    });

    it('should reject non-member', async () => {
      mockChatService.isMember.mockResolvedValueOnce(false);
      await expect(service.getPinnedMessages('g1', 'u9')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── getGroupAttachments ─────────────────────────────────

  describe('getGroupAttachments', () => {
    it('should list every attachment of the group, independent of feed pagination', async () => {
      // Deux messages non supprimés du groupe, un seul portant une pièce jointe.
      msgRepo.find = jest.fn().mockResolvedValue([
        { id: 'm1', senderId: 'u1', sentAt: new Date('2024-01-01') },
        { id: 'm2', senderId: 'u2', sentAt: new Date('2024-01-02') },
      ]);
      mediaFileModel.find.mockReturnValue({
        sort: () => ({
          lean: () =>
            Promise.resolve([
              {
                _id: { toString: () => 'media1' },
                owner_id: 'm2',
                original_filename: 'doc.pdf',
                mimetype: 'application/pdf',
                size_bytes: 2048,
                uploaded_at: new Date('2024-01-02'),
              },
            ]),
        }),
      });

      const result = await service.getGroupAttachments('g1', 'u1');

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0]).toMatchObject({
        message_id: 'm2',
        sender_id: 'u2',
        media_id: 'media1',
        filename: 'doc.pdf',
        size_bytes: 2048,
      });
      // Ne scanne que les messages non supprimés du groupe.
      expect(msgRepo.find).toHaveBeenCalledWith({
        where: { groupId: 'g1', isDeleted: false },
        select: ['id', 'senderId', 'sentAt'],
      });
    });

    it('should short-circuit to an empty list when the group has no messages', async () => {
      msgRepo.find = jest.fn().mockResolvedValue([]);
      const result = await service.getGroupAttachments('g1', 'u1');
      expect(result.attachments).toEqual([]);
      expect(mediaFileModel.find).not.toHaveBeenCalled();
    });

    it('should reject non-member', async () => {
      mockChatService.isMember.mockResolvedValueOnce(false);
      await expect(service.getGroupAttachments('g1', 'u9')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── editMessage ─────────────────────────────────────────

  describe('editMessage', () => {
    it('should re-encrypt edited content', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false });
      const mongoDoc = makeMongoMsg('msg1');
      messageModel.findOne.mockResolvedValue(mongoDoc);

      const edited = await service.editMessage('msg1', 'u1', 'Updated content');
      expect(edited.content).toBe('Updated content');
      expect(mongoDoc.save).toHaveBeenCalled();
    });

    it('should reject if not the author', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false });
      await expect(
        service.editMessage('msg1', 'u2', 'Hijacked'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if message is deleted', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: true });
      await expect(
        service.editMessage('msg1', 'u1', 'Cant edit'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── reactions ────────────────────────────────────────────

  describe('setReaction', () => {
    it('should replace any existing reaction from the same user then push the new one', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', isDeleted: false });
      messageModel.findOne.mockReturnValue({
        lean: () => Promise.resolve({ reactions: [{ pg_user_id: 'u1', emoji: '👍', reacted_at: new Date() }] }),
      });

      const result = await service.setReaction('msg1', 'u1', '👍');

      expect(messageModel.updateOne).toHaveBeenNthCalledWith(
        1,
        { pg_message_id: 'msg1' },
        { $pull: { reactions: { pg_user_id: 'u1' } } },
      );
      expect(messageModel.updateOne).toHaveBeenNthCalledWith(
        2,
        { pg_message_id: 'msg1' },
        { $push: { reactions: expect.objectContaining({ pg_user_id: 'u1', emoji: '👍' }) } },
      );
      expect(result.group_id).toBe('g1');
      expect(result.reactions).toHaveLength(1);
    });

    it('should reject non-member', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', isDeleted: false });
      mockChatService.assertCanParticipate.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.setReaction('msg1', 'u9', '👍')).rejects.toThrow(ForbiddenException);
    });

    it('should throw on missing message', async () => {
      msgRepo.findOne.mockResolvedValue(null);
      await expect(service.setReaction('msg99', 'u1', '👍')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeReaction', () => {
    it("should pull the user's reaction regardless of emoji", async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', isDeleted: false });
      messageModel.findOne.mockReturnValue({ lean: () => Promise.resolve({ reactions: [] }) });

      const result = await service.removeReaction('msg1', 'u1');

      expect(messageModel.updateOne).toHaveBeenCalledWith(
        { pg_message_id: 'msg1' },
        { $pull: { reactions: { pg_user_id: 'u1' } } },
      );
      expect(result.reactions).toEqual([]);
    });

    it('should reject non-member', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', isDeleted: false });
      mockChatService.assertCanParticipate.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.removeReaction('msg1', 'u9')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── softDeleteMessage ───────────────────────────────────

  describe('softDeleteMessage', () => {
    it('should allow author to delete their own message', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false });
      messageModel.findOne.mockResolvedValue(makeMongoMsg('msg1'));

      const result = await service.softDeleteMessage('msg1', 'u1');
      expect(result.deleted).toBe(true);
      expect(msgRepo.save).toHaveBeenCalled();
    });

    it('should allow admin to delete another user message', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2', sentAt: new Date(), isDeleted: false });
      mockChatService.getMembers.mockResolvedValue([
        { userId: 'u1', roleInGroup: 'admin', groupId: 'g1' },
      ]);
      messageModel.findOne.mockResolvedValue(makeMongoMsg('msg1'));

      const result = await service.softDeleteMessage('msg1', 'u1');
      expect(result.deleted).toBe(true);
    });

    it('should reject non-author non-admin from deleting', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false });
      mockChatService.getMembers.mockResolvedValue([
        { userId: 'u2', roleInGroup: 'message', groupId: 'g1' },
      ]);
      await expect(
        service.softDeleteMessage('msg1', 'u2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should cascade-delete GridFS attachments left on the message', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false });
      messageModel.findOne.mockResolvedValue(makeMongoMsg('msg1'));
      mediaFileModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: { toString: () => 'media1' }, owner_id: 'msg1', original_filename: 'a.png', mimetype: 'image/png', size_bytes: 10 },
        ]),
      });

      await service.softDeleteMessage('msg1', 'u1');

      expect(mediaService.delete).toHaveBeenCalledWith('media1');
    });

    it('should not fail the message deletion if attachment cleanup fails', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false });
      messageModel.findOne.mockResolvedValue(makeMongoMsg('msg1'));
      mediaFileModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: { toString: () => 'media1' }, owner_id: 'msg1', original_filename: 'a.png', mimetype: 'image/png', size_bytes: 10 },
        ]),
      });
      mediaService.delete.mockRejectedValue(new Error('gridfs down'));

      const result = await service.softDeleteMessage('msg1', 'u1');
      expect(result.deleted).toBe(true);
    });
  });

  // ── markRead ────────────────────────────────────────────

  describe('markRead', () => {
    it('should upsert read receipt', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false });
      const result = await service.markRead('msg1', 'u2');
      expect(result.read).toBe(true);
      expect(result.message_id).toBe('msg1');
      expect(receiptRepo.upsert).toHaveBeenCalled();
    });

    it('should throw on missing message', async () => {
      msgRepo.findOne.mockResolvedValue(null);
      await expect(service.markRead('msg99', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── pin / unpin ─────────────────────────────────────────

  describe('pinMessage', () => {
    it('should pin a message when the caller has actions/admin group role', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2', sentAt: new Date(), isDeleted: false, pinned: false });
      messageModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

      const result = await service.pinMessage('msg1', 'u1');

      expect(mockChatService.assertGroupRole).toHaveBeenCalledWith('g1', 'u1', ['actions', 'admin']);
      expect(msgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ pinned: true, pinnedById: 'u1' }));
      expect(result.pinned).toBe(true);
    });

    it('should reject a caller without actions/admin group role', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2', sentAt: new Date(), isDeleted: false, pinned: false });
      mockChatService.assertGroupRole.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.pinMessage('msg1', 'u3')).rejects.toThrow(ForbiddenException);
      expect(msgRepo.save).not.toHaveBeenCalled();
    });

    it('should throw on missing message', async () => {
      msgRepo.findOne.mockResolvedValue(null);
      await expect(service.pinMessage('msg99', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should let any DM participant pin — no actions/admin role exists in a 1:1 conversation', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'dm1', senderId: 'u2', sentAt: new Date(), isDeleted: false, pinned: false });
      groupRepo.findOne.mockResolvedValue({ id: 'dm1', type: ChatGroupTypeEnum.DIRECT_MESSAGE });
      messageModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

      const result = await service.pinMessage('msg1', 'u1');

      expect(mockChatService.isMember).toHaveBeenCalledWith('dm1', 'u1');
      expect(mockChatService.assertGroupRole).not.toHaveBeenCalled();
      expect(result.pinned).toBe(true);
    });

    it('should reject pinning in a DM for a non-participant', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'dm1', senderId: 'u2', sentAt: new Date(), isDeleted: false, pinned: false });
      groupRepo.findOne.mockResolvedValue({ id: 'dm1', type: ChatGroupTypeEnum.DIRECT_MESSAGE });
      mockChatService.isMember.mockResolvedValueOnce(false);

      await expect(service.pinMessage('msg1', 'u9')).rejects.toThrow(ForbiddenException);
      expect(msgRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('unpinMessage', () => {
    it('should unpin a message when the caller has actions/admin group role', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2', sentAt: new Date(), isDeleted: false, pinned: true, pinnedAt: new Date(), pinnedById: 'u1' });
      messageModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

      const result = await service.unpinMessage('msg1', 'u1');

      expect(msgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ pinned: false, pinnedAt: null, pinnedById: null }));
      expect(result.pinned).toBe(false);
    });

    it('should let any DM participant unpin', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'dm1', senderId: 'u2', sentAt: new Date(), isDeleted: false, pinned: true, pinnedAt: new Date(), pinnedById: 'u2' });
      groupRepo.findOne.mockResolvedValue({ id: 'dm1', type: ChatGroupTypeEnum.DIRECT_MESSAGE });
      messageModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

      const result = await service.unpinMessage('msg1', 'u1');

      expect(mockChatService.isMember).toHaveBeenCalledWith('dm1', 'u1');
      expect(result.pinned).toBe(false);
    });
  });

  // ── Admin / moderator operations (bypass membership & group role) ──

  describe('editMessageAsModerator', () => {
    it('should re-encrypt any message without the author-only check', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2', sentAt: new Date(), isDeleted: false });
      const mongoDoc = makeMongoMsg('msg1');
      messageModel.findOne.mockResolvedValue(mongoDoc);

      const edited = await service.editMessageAsModerator('msg1', 'Corrigé par la modération');

      // Un modérateur (u1) modifie le message d'un autre (u2) — jamais rejeté.
      expect(edited.content).toBe('Corrigé par la modération');
      expect(mongoDoc.save).toHaveBeenCalled();
      expect(msgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ editedAt: expect.any(Date) }));
    });

    it('should throw on a missing or deleted message', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2', isDeleted: true });
      await expect(service.editMessageAsModerator('msg1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('pinMessageAsModerator / unpinMessageAsModerator', () => {
    it('should pin any message without a group-role check', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2', sentAt: new Date(), isDeleted: false, pinned: false });
      messageModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

      const result = await service.pinMessageAsModerator('msg1', 'mod1');

      expect(mockChatService.assertGroupRole).not.toHaveBeenCalled();
      expect(msgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ pinned: true, pinnedById: 'mod1' }));
      expect(result.pinned).toBe(true);
    });

    it('should unpin any message without a group-role check', async () => {
      msgRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2', sentAt: new Date(), isDeleted: false, pinned: true, pinnedById: 'u2' });
      messageModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

      const result = await service.unpinMessageAsModerator('msg1');

      expect(msgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ pinned: false, pinnedAt: null, pinnedById: null }));
      expect(result.pinned).toBe(false);
    });
  });

  describe('getPinnedMessagesAsAdmin', () => {
    it('should return pinned messages without a membership check', async () => {
      groupRepo.findOne.mockResolvedValue({ id: 'g1', deletedAt: null });
      msgRepo.find = jest.fn().mockResolvedValue([
        { id: 'm2', groupId: 'g1', senderId: 'u1', sentAt: new Date(), isDeleted: false, mongoMessageId: 'mongo2', pinned: true, pinnedAt: new Date() },
      ]);
      messageModel.find.mockReturnValue({ lean: () => Promise.resolve([]) });

      const result = await service.getPinnedMessagesAsAdmin('g1');

      expect(mockChatService.isMember).not.toHaveBeenCalled();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('m2');
    });

    it('should throw when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(service.getPinnedMessagesAsAdmin('g9')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getGroupAttachmentsAsAdmin', () => {
    it('should list every attachment without a membership check', async () => {
      groupRepo.findOne.mockResolvedValue({ id: 'g1', deletedAt: null });
      msgRepo.find = jest.fn().mockResolvedValue([
        { id: 'm2', senderId: 'u2', sentAt: new Date('2024-01-02') },
      ]);
      mediaFileModel.find.mockReturnValue({
        sort: () => ({
          lean: () =>
            Promise.resolve([
              {
                _id: { toString: () => 'media1' },
                owner_id: 'm2',
                original_filename: 'doc.pdf',
                mimetype: 'application/pdf',
                size_bytes: 2048,
                uploaded_at: new Date('2024-01-02'),
              },
            ]),
        }),
      });

      const result = await service.getGroupAttachmentsAsAdmin('g1');

      expect(mockChatService.isMember).not.toHaveBeenCalled();
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0]).toMatchObject({ message_id: 'm2', media_id: 'media1', filename: 'doc.pdf' });
    });

    it('should throw when the group does not exist', async () => {
      groupRepo.findOne.mockResolvedValue(null);
      await expect(service.getGroupAttachmentsAsAdmin('g9')).rejects.toThrow(NotFoundException);
    });
  });
});
