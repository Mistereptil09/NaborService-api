import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PollsController } from '../polls.controller';
import { PollsService } from '../polls.service';
import { PollsGateway } from '../polls.gateway';
import { ChatService } from '../../messaging/chat.service';
import { ChatMessageService } from '../../messaging/chat-message.service';
import { ChatGateway } from '../../messaging/chat.gateway';
import { GroupRoleEnum } from '../../../common/enums';

describe('PollsController', () => {
  let controller: PollsController;
  let service: any;
  let gateway: any;
  let chatService: any;
  let chatMessageService: any;
  let chatGateway: any;

  const residentUser = {
    user: {
      sub: 'u1',
      role: 'resident',
      locale: 'fr',
      iat: 1,
      exp: 9999999999,
    },
  };
  const repUser = {
    user: {
      sub: 'u1',
      role: 'neighbourhood_rep',
      locale: 'fr',
      iat: 1,
      exp: 9999999999,
    },
  };

  beforeEach(async () => {
    service = {
      listPolls: jest.fn().mockResolvedValue([]),
      createPoll: jest.fn().mockResolvedValue({ id: 'p1', title: 'Test' }),
      getPoll: jest.fn().mockResolvedValue({ id: 'p1', results: [] }),
      updatePoll: jest.fn().mockResolvedValue({ id: 'p1' }),
      softDeletePoll: jest.fn().mockResolvedValue({ deletedAt: new Date() }),
      closePoll: jest.fn().mockResolvedValue({ closedAt: new Date() }),
      addOption: jest.fn().mockResolvedValue({ id: 'o1', label: 'Yes' }),
      deleteOption: jest.fn().mockResolvedValue({ removed: true }),
      getMyVote: jest.fn().mockResolvedValue({ votes: [] }),
      vote: jest.fn().mockResolvedValue({ userId: 'u1', optionId: 'o1' }),
      updateVote: jest.fn().mockResolvedValue({ userId: 'u1', optionId: 'o1' }),
      deleteVote: jest.fn().mockResolvedValue({ deleted: true }),
    };

    gateway = {
      emitPollUpdated: jest.fn(),
      emitPollClosed: jest.fn(),
      emitOptionAdded: jest.fn(),
    };

    chatService = {
      assertGroupRole: jest.fn().mockResolvedValue(undefined),
      getNeighbourhoodGroup: jest.fn().mockResolvedValue(null),
      isMember: jest.fn().mockResolvedValue(false),
    };
    chatMessageService = {
      sendMessage: jest
        .fn()
        .mockResolvedValue({ id: 'm1', type: 'poll', poll_id: 'p1' }),
    };
    chatGateway = {
      emitToGroup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PollsController],
      providers: [
        { provide: PollsService, useValue: service },
        { provide: PollsGateway, useValue: gateway },
        { provide: ChatService, useValue: chatService },
        { provide: ChatMessageService, useValue: chatMessageService },
        { provide: ChatGateway, useValue: chatGateway },
      ],
    }).compile();

    controller = module.get(PollsController);
  });

  it('should be defined', () => expect(controller).toBeDefined());

  it('GET /polls', async () => {
    await controller.getPolls('nb1', undefined);
    expect(service.listPolls).toHaveBeenCalledWith('nb1', undefined);
  });

  it('GET /polls?group_id', async () => {
    await controller.getPolls(undefined, 'g1');
    expect(service.listPolls).toHaveBeenCalledWith(undefined, 'g1');
  });

  describe('POST /polls — neighbourhood scope (global role)', () => {
    it('allows neighbourhood_rep+', async () => {
      await controller.createPoll(repUser as any, { title: 'Test' });
      expect(service.createPoll).toHaveBeenCalledWith('u1', { title: 'Test' });
      expect(chatMessageService.sendMessage).not.toHaveBeenCalled();
    });

    it('rejects resident', async () => {
      await expect(
        controller.createPoll(residentUser as any, { title: 'Test' } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(service.createPoll).not.toHaveBeenCalled();
    });

    it("bridges into the neighbourhood's own conversation when the group exists and the creator is a member", async () => {
      chatService.getNeighbourhoodGroup.mockResolvedValue({ id: 'nb-g1' });
      chatService.isMember.mockResolvedValue(true);

      await controller.createPoll(repUser as any, {
        title: 'Test',
        neighbourhood_id: 'nb1',
      });

      expect(chatService.getNeighbourhoodGroup).toHaveBeenCalledWith('nb1');
      expect(chatService.isMember).toHaveBeenCalledWith('nb-g1', 'u1');
      expect(chatMessageService.sendMessage).toHaveBeenCalledWith(
        'nb-g1',
        'u1',
        {
          content: 'Test',
          type: 'poll',
          poll_id: 'p1',
        },
      );
      expect(chatGateway.emitToGroup).toHaveBeenCalledWith(
        'nb-g1',
        'message:received',
        {
          id: 'm1',
          type: 'poll',
          poll_id: 'p1',
        },
      );
    });

    it('skips the bridge when the neighbourhood has no auto-managed group yet', async () => {
      chatService.getNeighbourhoodGroup.mockResolvedValue(null);

      await controller.createPoll(repUser as any, {
        title: 'Test',
        neighbourhood_id: 'nb1',
      });

      expect(chatMessageService.sendMessage).not.toHaveBeenCalled();
    });

    it("skips the bridge when the creator isn't a member of the neighbourhood's group", async () => {
      chatService.getNeighbourhoodGroup.mockResolvedValue({ id: 'nb-g1' });
      chatService.isMember.mockResolvedValue(false);

      await controller.createPoll(repUser as any, {
        title: 'Test',
        neighbourhood_id: 'nb1',
      });

      expect(chatMessageService.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('POST /polls — group scope (group role)', () => {
    it('allows a resident with ACTIONS/ADMIN role in the target group, and synthesizes a chat message', async () => {
      await controller.createPoll(residentUser as any, {
        title: 'Test',
        group_id: 'g1',
      });
      expect(chatService.assertGroupRole).toHaveBeenCalledWith('g1', 'u1', [
        GroupRoleEnum.ACTIONS,
        GroupRoleEnum.ADMIN,
      ]);
      expect(service.createPoll).toHaveBeenCalledWith('u1', {
        title: 'Test',
        group_id: 'g1',
      });
      expect(chatMessageService.sendMessage).toHaveBeenCalledWith('g1', 'u1', {
        content: 'Test',
        type: 'poll',
        poll_id: 'p1',
      });
      expect(chatGateway.emitToGroup).toHaveBeenCalledWith(
        'g1',
        'message:received',
        {
          id: 'm1',
          type: 'poll',
          poll_id: 'p1',
        },
      );
    });

    it('propagates rejection when the group role check fails', async () => {
      chatService.assertGroupRole.mockRejectedValue(
        new ForbiddenException('Permission insuffisante'),
      );
      await expect(
        controller.createPoll(
          residentUser as any,
          { title: 'Test', group_id: 'g1' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(service.createPoll).not.toHaveBeenCalled();
    });
  });

  it('GET /polls/:id', async () => {
    await controller.getPoll('p1');
    expect(service.getPoll).toHaveBeenCalledWith('p1');
  });

  it('PATCH /polls/:id', async () => {
    await controller.updatePoll('p1', residentUser as any, { title: 'New' });
    expect(service.updatePoll).toHaveBeenCalledWith(
      'p1',
      'u1',
      { title: 'New' },
      'resident',
    );
  });

  it('DELETE /polls/:id', async () => {
    await controller.deletePoll('p1', residentUser as any);
    expect(service.softDeletePoll).toHaveBeenCalledWith('p1', 'u1', 'resident');
  });

  it('POST /polls/:id/close', async () => {
    await controller.closePoll('p1', residentUser as any);
    expect(service.closePoll).toHaveBeenCalledWith('p1', 'u1', 'resident');
  });

  it('POST /polls/:id/options', async () => {
    await controller.addOption('p1', residentUser as any, {
      label: 'Yes',
      weight: 5,
    });
    expect(service.addOption).toHaveBeenCalledWith(
      'p1',
      'u1',
      'Yes',
      'resident',
      5,
    );
  });

  it('DELETE /polls/:id/options/:oid', async () => {
    await controller.deleteOption('p1', 'o1', residentUser as any);
    expect(service.deleteOption).toHaveBeenCalledWith(
      'p1',
      'o1',
      'u1',
      'resident',
    );
  });

  it('GET /polls/:id/vote', async () => {
    await controller.getMyVote('p1', residentUser as any);
    expect(service.getMyVote).toHaveBeenCalledWith('p1', 'u1');
  });

  it('POST /polls/:id/vote — no weight in the payload', async () => {
    await controller.vote('p1', residentUser as any, { option_id: 'o1' });
    expect(service.vote).toHaveBeenCalledWith('p1', 'u1', 'o1');
  });

  it('PUT /polls/:id/vote — no weight in the payload', async () => {
    await controller.updateVote('p1', residentUser as any, { option_id: 'o1' });
    expect(service.updateVote).toHaveBeenCalledWith('p1', 'u1', 'o1');
  });

  it('DELETE /polls/:id/vote', async () => {
    await controller.deleteVote('p1', residentUser as any);
    expect(service.deleteVote).toHaveBeenCalledWith('p1', 'u1', undefined);
  });
});
