import { Test, TestingModule } from '@nestjs/testing';
import { PollsController } from '../polls.controller';
import { PollsService } from '../polls.service';
import { PollsGateway } from '../polls.gateway';

describe('PollsController', () => {
  let controller: PollsController;
  let service: any;
  let gateway: any;

  const mockUser = { user: { sub: 'u1', role: 'resident', locale: 'fr', iat: 1, exp: 9999999999 } };

  beforeEach(async () => {
    service = {
      getActivePolls: jest.fn().mockResolvedValue([]),
      createPoll: jest.fn().mockResolvedValue({ id: 'p1' }),
      getPoll: jest.fn().mockResolvedValue({ id: 'p1', results: [] }),
      updatePoll: jest.fn().mockResolvedValue({ id: 'p1' }),
      softDeletePoll: jest.fn().mockResolvedValue({ deletedAt: new Date() }),
      closePoll: jest.fn().mockResolvedValue({ closedAt: new Date() }),
      addOption: jest.fn().mockResolvedValue({ id: 'o1', label: 'Yes' }),
      deleteOption: jest.fn().mockResolvedValue({ removed: true }),
      getMyVote: jest.fn().mockResolvedValue({ votes: [] }),
      vote: jest.fn().mockResolvedValue({ userId: 'u1', optionId: 'o1' }),
      updateVote: jest.fn().mockResolvedValue({ userId: 'u1', optionId: 'o1', weight: 2 }),
      deleteVote: jest.fn().mockResolvedValue({ deleted: true }),
    };

    gateway = {
      emitPollUpdated: jest.fn(),
      emitPollClosed: jest.fn(),
      emitOptionAdded: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PollsController],
      providers: [
        { provide: PollsService, useValue: service },
        { provide: PollsGateway, useValue: gateway },
      ],
    }).compile();

    controller = module.get(PollsController);
  });

  it('should be defined', () => expect(controller).toBeDefined());

  it('GET /polls', async () => {
    await controller.getPolls('nb1');
    expect(service.getActivePolls).toHaveBeenCalledWith('nb1');
  });

  it('POST /polls', async () => {
    await controller.createPoll(mockUser as any, { title: 'Test' });
    expect(service.createPoll).toHaveBeenCalledWith('u1', { title: 'Test' });
  });

  it('GET /polls/:id', async () => {
    await controller.getPoll('p1');
    expect(service.getPoll).toHaveBeenCalledWith('p1');
  });

  it('PATCH /polls/:id', async () => {
    await controller.updatePoll('p1', mockUser as any, { title: 'New' });
    expect(service.updatePoll).toHaveBeenCalledWith('p1', 'u1', { title: 'New' }, 'resident');
  });

  it('DELETE /polls/:id', async () => {
    await controller.deletePoll('p1', mockUser as any);
    expect(service.softDeletePoll).toHaveBeenCalledWith('p1', 'u1', 'resident');
  });

  it('POST /polls/:id/close', async () => {
    await controller.closePoll('p1', mockUser as any);
    expect(service.closePoll).toHaveBeenCalledWith('p1', 'u1', 'resident');
  });

  it('POST /polls/:id/options', async () => {
    await controller.addOption('p1', mockUser as any, { label: 'Yes' });
    expect(service.addOption).toHaveBeenCalledWith('p1', 'u1', 'Yes');
  });

  it('DELETE /polls/:id/options/:oid', async () => {
    await controller.deleteOption('p1', 'o1', mockUser as any);
    expect(service.deleteOption).toHaveBeenCalledWith('p1', 'o1', 'u1');
  });

  it('GET /polls/:id/vote', async () => {
    await controller.getMyVote('p1', mockUser as any);
    expect(service.getMyVote).toHaveBeenCalledWith('p1', 'u1');
  });

  it('POST /polls/:id/vote', async () => {
    await controller.vote('p1', mockUser as any, { option_id: 'o1', weight: 2 });
    expect(service.vote).toHaveBeenCalledWith('p1', 'u1', 'o1', 2);
  });

  it('PUT /polls/:id/vote', async () => {
    await controller.updateVote('p1', mockUser as any, { option_id: 'o1', weight: 3 });
    expect(service.updateVote).toHaveBeenCalledWith('p1', 'u1', 'o1', 3);
  });

  it('DELETE /polls/:id/vote', async () => {
    await controller.deleteVote('p1', mockUser as any);
    expect(service.deleteVote).toHaveBeenCalledWith('p1', 'u1', undefined);
  });
});
