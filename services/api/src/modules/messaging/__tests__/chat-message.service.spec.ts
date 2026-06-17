import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getModelToken } from '@nestjs/mongoose';
import { ChatMessageService } from '../chat-message.service';
import { ChatService } from '../chat.service';
import { ChatGroup } from '../entities/chat-group.entity';
import { MessageMetadata } from '../entities/message-metadata.entity';
import { MessageReadReceipt } from '../entities/message-read-receipt.entity';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ChatMessageService', () => {
  let service: ChatMessageService;
  let mockChatService: any;
  let redis: any;
  let msgRepo: any;
  let receiptRepo: any;
  let groupRepo: any;
  let messageModel: any;
  let configService: any;

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
    };

    msgRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: dto.id ?? 'msg1', ...dto })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    receiptRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      upsert: jest.fn().mockResolvedValue(undefined),
    };

    messageModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    groupRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatMessageService,
        { provide: getRepositoryToken(MessageMetadata), useValue: msgRepo },
        { provide: getRepositoryToken(MessageReadReceipt), useValue: receiptRepo },
        { provide: getRepositoryToken(ChatGroup), useValue: groupRepo },
        { provide: getModelToken('Message'), useValue: messageModel },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: ChatService, useValue: mockChatService },
        { provide: ConfigService, useValue: configService },
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

    it('should reject muted user', async () => {
      mockChatService.isMuted.mockResolvedValueOnce(true);
      await expect(
        service.sendMessage('g1', 'u1', { content: 'Hi', type: 'text' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-member', async () => {
      mockChatService.isMember.mockResolvedValueOnce(false);
      await expect(
        service.sendMessage('g1', 'u9', { content: 'Hi', type: 'text' }),
      ).rejects.toThrow(ForbiddenException);
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
});
