import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ChatGateway } from '../chat.gateway';
import { ChatMessageService } from '../chat-message.service';
import { ChatService } from '../chat.service';
import { REDIS_CLIENT } from '../../../database/redis.module';
import { WsAuthService } from '../../auth/ws-auth.service';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let chatMessageService: any;
  let chatService: any;
  let jwtService: any;
  let redis: any;

  const mockSocket = (token = 'valid-token') => ({
    handshake: { auth: { token }, query: {} },
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    userId: undefined as string | undefined,
  });

  beforeEach(async () => {
    redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    jwtService = {
      verify: jest
        .fn()
        .mockReturnValue({ sub: 'u1', role: 'resident', locale: 'fr' }),
    };

    chatMessageService = {
      sendMessage: jest
        .fn()
        .mockResolvedValue({ id: 'msg1', group_id: 'g1', content: 'Hello' }),
      markRead: jest
        .fn()
        .mockResolvedValue({ message_id: 'msg1', user_id: 'u1', read: true }),
      editMessage: jest
        .fn()
        .mockResolvedValue({ id: 'msg1', group_id: 'g1', content: 'Edited' }),
      softDeleteMessage: jest
        .fn()
        .mockResolvedValue({ deleted: true, message_id: 'msg1' }),
      setReaction: jest.fn().mockResolvedValue({
        group_id: 'g1',
        message_id: 'msg1',
        reactions: [{ pg_user_id: 'u1', emoji: '👍' }],
      }),
      removeReaction: jest.fn().mockResolvedValue({
        group_id: 'g1',
        message_id: 'msg1',
        reactions: [],
      }),
      pinMessage: jest
        .fn()
        .mockResolvedValue({ id: 'msg1', group_id: 'g1', pinned: true }),
      unpinMessage: jest
        .fn()
        .mockResolvedValue({ id: 'msg1', group_id: 'g1', pinned: false }),
    };

    chatService = {
      isMember: jest.fn().mockResolvedValue(true),
      markGroupRead: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        WsAuthService,
        { provide: JwtService, useValue: jwtService },
        { provide: ChatMessageService, useValue: chatMessageService },
        { provide: ChatService, useValue: chatService },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    gateway = module.get(ChatGateway);
    // Mock the server
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
    };
  });

  it('should be defined', () => expect(gateway).toBeDefined());

  // ── Connection ──────────────────────────────────────────

  describe('handleConnection', () => {
    it('should authenticate with valid token', async () => {
      const client = mockSocket();
      await gateway.handleConnection(client as any);
      expect(client.userId).toBe('u1');
      expect(client.join).toHaveBeenCalledWith('user:u1');
    });

    it('should disconnect on invalid token', async () => {
      jwtService.verify.mockImplementationOnce(() => {
        throw new Error('invalid');
      });
      const client = mockSocket('bad');
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect when no token provided', async () => {
      const client = { ...mockSocket(), handshake: { auth: {}, query: {} } };
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  // ── message:send ────────────────────────────────────────

  describe('message:send', () => {
    it('should send and broadcast to group', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleSend(
        { group_id: 'g1', content: 'Hello', type: 'text' },
        client as any,
      );
      expect(result.status).toBe('sent');
      expect(chatMessageService.sendMessage).toHaveBeenCalledWith('g1', 'u1', {
        content: 'Hello',
        type: 'text',
        parent_message_id: undefined,
      });
    });

    it('should pass parent_message_id through to the service', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      await gateway.handleSend(
        {
          group_id: 'g1',
          content: 'Reply',
          type: 'text',
          parent_message_id: 'parent1',
        },
        client as any,
      );
      expect(chatMessageService.sendMessage).toHaveBeenCalledWith('g1', 'u1', {
        content: 'Reply',
        type: 'text',
        parent_message_id: 'parent1',
      });
    });
  });

  // ── message:react / message:unreact ─────────────────────

  describe('message:react', () => {
    it('should react and broadcast the updated reaction list to the group room', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleReact(
        { message_id: 'msg1', emoji: '👍' },
        client as any,
      );
      expect(chatMessageService.setReaction).toHaveBeenCalledWith(
        'msg1',
        'u1',
        '👍',
      );
      expect(result.status).toBe('reacted');
      expect((gateway as any).server.to).toHaveBeenCalledWith('chat:group:g1');
    });
  });

  describe('message:unreact', () => {
    it('should unreact and broadcast the updated reaction list', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleUnreact(
        { message_id: 'msg1' },
        client as any,
      );
      expect(chatMessageService.removeReaction).toHaveBeenCalledWith(
        'msg1',
        'u1',
      );
      expect(result.status).toBe('unreacted');
      expect((gateway as any).server.to).toHaveBeenCalledWith('chat:group:g1');
    });
  });

  // ── message:read ────────────────────────────────────────

  describe('message:read', () => {
    it('should mark read and broadcast ack', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleRead(
        { message_id: 'msg1' },
        client as any,
      );
      expect(result.read).toBe(true);
      expect(chatMessageService.markRead).toHaveBeenCalledWith('msg1', 'u1');
    });
  });

  // ── message:edit ────────────────────────────────────────

  describe('message:edit', () => {
    it('should edit and broadcast', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleEdit(
        { message_id: 'msg1', new_content: 'Updated' },
        client as any,
      );
      expect(result.status).toBe('edited');
    });
  });

  // ── message:delete ──────────────────────────────────────

  describe('message:delete', () => {
    it('should delete and broadcast', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleDelete(
        { message_id: 'msg1' },
        client as any,
      );
      expect(result.deleted).toBe(true);
    });
  });

  // ── message:pin / message:unpin ─────────────────────────

  describe('message:pin', () => {
    it('should pin and broadcast to the group room', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handlePin(
        { message_id: 'msg1' },
        client as any,
      );
      expect(chatMessageService.pinMessage).toHaveBeenCalledWith('msg1', 'u1');
      expect(result.status).toBe('pinned');
      expect((gateway as any).server.to).toHaveBeenCalledWith('chat:group:g1');
    });
  });

  describe('message:unpin', () => {
    it('should unpin and broadcast to the group room', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleUnpin(
        { message_id: 'msg1' },
        client as any,
      );
      expect(chatMessageService.unpinMessage).toHaveBeenCalledWith(
        'msg1',
        'u1',
      );
      expect(result.status).toBe('unpinned');
      expect((gateway as any).server.to).toHaveBeenCalledWith('chat:group:g1');
    });
  });

  // ── group:read ───────────────────────────────────────────

  describe('group:read', () => {
    it('should mark the conversation read', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleGroupRead(
        { group_id: 'g1' },
        client as any,
      );
      expect(chatService.markGroupRead).toHaveBeenCalledWith('g1', 'u1');
      expect(result.status).toBe('read');
    });
  });

  // ── emitToGroup ──────────────────────────────────────────

  describe('emitToGroup', () => {
    it('should emit the given event to the group room', () => {
      gateway.emitToGroup('g1', 'message:received', { id: 'm1' });
      expect((gateway as any).server.to).toHaveBeenCalledWith('chat:group:g1');
    });
  });

  // ── typing ──────────────────────────────────────────────

  describe('typing:start', () => {
    it('should set Redis TTL and broadcast', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      await gateway.handleTypingStart({ group_id: 'g1' }, client as any);
      expect(redis.set).toHaveBeenCalledWith('typing:g1:u1', '1', 'EX', 4);
    });
  });

  describe('typing:stop', () => {
    it('should delete Redis key and broadcast', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      await gateway.handleTypingStop({ group_id: 'g1' }, client as any);
      expect(redis.del).toHaveBeenCalledWith('typing:g1:u1');
    });
  });

  // ── room management ─────────────────────────────────────

  describe('join_group', () => {
    it('should join room if member', async () => {
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleJoinGroup(
        { group_id: 'g1' },
        client as any,
      );
      expect(result?.status).toBe('joined');
      expect(client.join).toHaveBeenCalledWith('chat:group:g1');
    });

    it('should reject if not member', async () => {
      chatService.isMember.mockResolvedValueOnce(false);
      const client = mockSocket();
      client.userId = 'u1';
      const result = await gateway.handleJoinGroup(
        { group_id: 'g1' },
        client as any,
      );
      expect(result?.status).toBe('forbidden');
    });
  });

  describe('leave_group', () => {
    it('should leave room', async () => {
      const client = mockSocket();
      const result = await gateway.handleLeaveGroup(
        { group_id: 'g1' },
        client as any,
      );
      expect(result.status).toBe('left');
      expect(client.leave).toHaveBeenCalledWith('chat:group:g1');
    });
  });
});
