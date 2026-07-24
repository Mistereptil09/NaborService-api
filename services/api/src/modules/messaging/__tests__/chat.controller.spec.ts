import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from '../chat.controller';
import { ChatService } from '../chat.service';
import { ChatMessageService } from '../chat-message.service';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: any;
  let chatMessageService: any;

  const mockUser = {
    user: {
      sub: 'u1',
      role: 'resident',
      locale: 'fr',
      iat: 1,
      exp: 9999999999,
    },
  };

  beforeEach(async () => {
    chatService = {
      getUserGroups: jest.fn().mockResolvedValue([]),
      createGroup: jest.fn().mockResolvedValue({ id: 'g1', name: 'Test' }),
      getGroupDetail: jest.fn().mockResolvedValue({ id: 'g1', name: 'Test' }),
      getGroupDetailForUser: jest
        .fn()
        .mockResolvedValue({ id: 'g1', name: 'Test' }),
      updateGroup: jest.fn().mockResolvedValue({ id: 'g1', name: 'Updated' }),
      softDeleteGroup: jest
        .fn()
        .mockResolvedValue({ id: 'g1', deletedAt: new Date() }),
      getMembers: jest.fn().mockResolvedValue([]),
      addMember: jest.fn().mockResolvedValue({ userId: 'u2', groupId: 'g1' }),
      removeMember: jest
        .fn()
        .mockResolvedValue({ userId: 'u2', leftAt: new Date() }),
      changeRole: jest
        .fn()
        .mockResolvedValue({ userId: 'u2', roleInGroup: 'admin' }),
      mute: jest.fn().mockResolvedValue({ muted_until: new Date() }),
      unmute: jest.fn().mockResolvedValue({ muted: false }),
      markGroupRead: jest.fn().mockResolvedValue(undefined),
    };

    chatMessageService = {
      getMessages: jest
        .fn()
        .mockResolvedValue({ messages: [], has_more: false }),
      getPinnedMessages: jest.fn().mockResolvedValue({ messages: [] }),
      sendMessage: jest
        .fn()
        .mockResolvedValue({ id: 'msg1', content: 'Hello' }),
      getMessage: jest.fn().mockResolvedValue({ id: 'msg1', content: 'Hello' }),
      editMessage: jest
        .fn()
        .mockResolvedValue({ id: 'msg1', content: 'Edited' }),
      softDeleteMessage: jest.fn().mockResolvedValue({ deleted: true }),
      pinMessage: jest.fn().mockResolvedValue({ id: 'msg1', pinned: true }),
      unpinMessage: jest.fn().mockResolvedValue({ id: 'msg1', pinned: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: chatService },
        { provide: ChatMessageService, useValue: chatMessageService },
      ],
    }).compile();

    controller = module.get(ChatController);
  });

  it('should be defined', () => expect(controller).toBeDefined());

  describe('GET /chat/groups', () => {
    it('should return user groups', async () => {
      chatService.getUserGroups.mockResolvedValue([
        { id: 'g1', name: 'Group A' },
      ]);
      const result = await controller.getGroups(mockUser as any);
      expect(result).toHaveLength(1);
      expect(chatService.getUserGroups).toHaveBeenCalledWith('u1');
    });
  });

  describe('POST /chat/groups', () => {
    it('should create a group', async () => {
      const result = await controller.createGroup(mockUser as any, {
        name: 'New',
      });
      expect(result.name).toBe('Test');
      expect(chatService.createGroup).toHaveBeenCalledWith('u1', {
        name: 'New',
      });
    });
  });

  describe('GET /chat/groups/:id', () => {
    it('should return group detail', async () => {
      const result = await controller.getGroup('g1', mockUser as any);
      expect(result.name).toBe('Test');
      expect(chatService.getGroupDetailForUser).toHaveBeenCalledWith(
        'g1',
        'u1',
      );
    });
  });

  describe('PATCH /chat/groups/:id', () => {
    it('should update group', async () => {
      const result = await controller.updateGroup('g1', mockUser as any, {
        name: 'Updated',
      });
      expect(result.name).toBe('Updated');
    });
  });

  describe('DELETE /chat/groups/:id', () => {
    it('should soft-delete group', async () => {
      const result = await controller.deleteGroup('g1', mockUser as any);
      expect(result.deletedAt).toBeDefined();
    });
  });

  describe('GET /chat/groups/:id/members', () => {
    it('should list members mapped to snake_case with joined user identity', async () => {
      chatService.getMembers.mockResolvedValueOnce([
        {
          userId: 'u2',
          roleInGroup: 'admin',
          joinedAt: new Date('2026-01-01'),
          user: {
            firstName: 'Jane',
            lastName: 'Doe',
            profilePictureMongoId: 'm1',
          },
        },
      ]);
      const result = await controller.getMembers('g1');
      expect(chatService.getMembers).toHaveBeenCalledWith('g1');
      expect(result).toEqual([
        {
          user_id: 'u2',
          role: 'admin',
          joined_at: new Date('2026-01-01'),
          first_name: 'Jane',
          last_name: 'Doe',
          profile_picture_mongo_id: 'm1',
        },
      ]);
    });
  });

  describe('POST /chat/groups/:id/members', () => {
    it('should add a member', async () => {
      await controller.addMember('g1', mockUser as any, { user_id: 'u2' });
      expect(chatService.addMember).toHaveBeenCalledWith('g1', 'u2', 'u1');
    });
  });

  describe('DELETE /chat/groups/:id/members/:uid', () => {
    it('should remove a member', async () => {
      await controller.removeMember('g1', 'u2', mockUser as any);
      expect(chatService.removeMember).toHaveBeenCalledWith('g1', 'u2', 'u1');
    });
  });

  describe('PATCH /chat/groups/:id/members/:uid', () => {
    it('should change role', async () => {
      await controller.changeRole('g1', 'u2', mockUser as any, {
        role: 'admin' as any,
      });
      expect(chatService.changeRole).toHaveBeenCalledWith(
        'g1',
        'u2',
        'admin',
        'u1',
      );
    });
  });

  describe('POST /chat/groups/:id/mute', () => {
    it('should mute', async () => {
      await controller.mute('g1', mockUser as any, { duration_minutes: 60 });
      expect(chatService.mute).toHaveBeenCalledWith('g1', 'u1', 60);
    });
  });

  describe('DELETE /chat/groups/:id/mute', () => {
    it('should unmute', async () => {
      await controller.unmute('g1', mockUser as any);
      expect(chatService.unmute).toHaveBeenCalledWith('g1', 'u1');
    });
  });

  describe('GET /chat/groups/:id/messages', () => {
    it('should return paginated messages', async () => {
      await controller.getMessages('g1', mockUser as any);
      expect(chatMessageService.getMessages).toHaveBeenCalledWith(
        'g1',
        'u1',
        undefined,
        50,
        undefined,
        'older',
      );
    });

    it('should pass cursor and limit', async () => {
      await controller.getMessages(
        'g1',
        mockUser as any,
        'cursor123',
        '25' as any,
      );
      expect(chatMessageService.getMessages).toHaveBeenCalledWith(
        'g1',
        'u1',
        'cursor123',
        '25',
        undefined,
        'older',
      );
    });

    it('should pass "around" through for jump-to-message', async () => {
      await controller.getMessages(
        'g1',
        mockUser as any,
        undefined,
        undefined,
        'msg5',
      );
      expect(chatMessageService.getMessages).toHaveBeenCalledWith(
        'g1',
        'u1',
        undefined,
        50,
        'msg5',
        'older',
      );
    });

    it('should pass direction=newer through for filling the gap back to live after a jump', async () => {
      await controller.getMessages(
        'g1',
        mockUser as any,
        'cursor123',
        undefined,
        undefined,
        'newer',
      );
      expect(chatMessageService.getMessages).toHaveBeenCalledWith(
        'g1',
        'u1',
        'cursor123',
        50,
        undefined,
        'newer',
      );
    });
  });

  describe('GET /chat/groups/:id/pinned', () => {
    it('should return pinned messages', async () => {
      await controller.getPinnedMessages('g1', mockUser as any);
      expect(chatMessageService.getPinnedMessages).toHaveBeenCalledWith(
        'g1',
        'u1',
      );
    });
  });

  describe('GET /chat/messages/:id', () => {
    it('should return single message', async () => {
      await controller.getMessage('msg1', mockUser as any);
      expect(chatMessageService.getMessage).toHaveBeenCalledWith('msg1', 'u1');
    });
  });

  describe('DELETE /chat/messages/:id', () => {
    it('should delete message', async () => {
      await controller.deleteMessage('msg1', mockUser as any);
      expect(chatMessageService.softDeleteMessage).toHaveBeenCalledWith(
        'msg1',
        'u1',
      );
    });
  });

  describe('POST /chat/messages/:id/pin', () => {
    it('should pin a message', async () => {
      const result = await controller.pinMessage('msg1', mockUser as any);
      expect(chatMessageService.pinMessage).toHaveBeenCalledWith('msg1', 'u1');
      expect(result.pinned).toBe(true);
    });
  });

  describe('DELETE /chat/messages/:id/pin', () => {
    it('should unpin a message', async () => {
      const result = await controller.unpinMessage('msg1', mockUser as any);
      expect(chatMessageService.unpinMessage).toHaveBeenCalledWith(
        'msg1',
        'u1',
      );
      expect(result.pinned).toBe(false);
    });
  });

  describe('POST /chat/groups/:id/read', () => {
    it('should mark the conversation read', async () => {
      const result = await controller.markGroupRead('g1', mockUser as any);
      expect(chatService.markGroupRead).toHaveBeenCalledWith('g1', 'u1');
      expect(result).toEqual({ group_id: 'g1', read: true });
    });
  });
});
