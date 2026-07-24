import { NotificationsService } from '../notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockRepo = {
    create: jest.fn((d) => d),
    save: jest.fn((n) => ({ ...n, id: 'notif-1', createdAt: new Date() })),
    find: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  const mockGateway = { emitToUser: jest.fn() };
  const mockUserRepo = { findOne: jest.fn() };
  const mockRedis = { exists: jest.fn() };
  const mockEmailQueue = { add: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepo.findOne.mockResolvedValue({
      id: 'u1',
      email: 'u1@example.com',
      firstName: 'Alice',
    });
    service = new NotificationsService(
      mockRepo as any,
      mockGateway as any,
      mockUserRepo as any,
      mockRedis as any,
      mockEmailQueue as any,
    );
  });

  it('saves + emits the in-app notification, and does NOT email when online', async () => {
    mockRedis.exists.mockResolvedValue(1); // online

    await service.create({
      userId: 'u1',
      type: 'new_follower',
      payload: { x: 1 },
    });

    expect(mockRepo.save).toHaveBeenCalled();
    expect(mockGateway.emitToUser).toHaveBeenCalledWith(
      'u1',
      'notification:new',
      expect.objectContaining({ type: 'new_follower' }),
    );
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  it('relays a non-essential email with the matching preferenceKey when offline', async () => {
    mockRedis.exists.mockResolvedValue(0); // offline

    await service.create({
      userId: 'u1',
      type: 'new_follower',
      payload: { x: 1 },
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        recipient: 'u1@example.com',
        templateName: 'notification',
        essential: false,
        preferenceKey: 'notifNewFollower',
        templateVariables: expect.objectContaining({ x: 1 }),
      }),
    );
  });

  it('greets the recipient, not the actor, in the follow email', async () => {
    mockRedis.exists.mockResolvedValue(0); // offline

    await service.create({
      userId: 'u1',
      type: 'new_follower',
      payload: { firstName: 'Bob', followerId: 'u2' },
    });

    const [, payload] = mockEmailQueue.add.mock.calls[0];
    expect(payload.templateVariables.firstName).toBe('Alice');
    expect(payload.templateVariables.actorFirstName).toBe('Bob');
    expect(payload.templateVariables.followerId).toBe('u2');
  });

  it('relays an essential email (no preferenceKey) when offline', async () => {
    mockRedis.exists.mockResolvedValue(0);

    await service.create({
      userId: 'u1',
      type: 'listing_accepted',
      payload: {},
    });

    const [, payload] = mockEmailQueue.add.mock.calls[0];
    expect(payload.essential).toBe(true);
    expect(payload.preferenceKey).toBeUndefined();
  });

  it('uses the waitlist-promoted template for waitlist_place', async () => {
    mockRedis.exists.mockResolvedValue(0);

    await service.create({
      userId: 'u1',
      type: 'waitlist_place',
      payload: { eventId: 'e1' },
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        templateName: 'waitlist-promoted',
        preferenceKey: 'notifWaitlist',
      }),
    );
  });

  it('skips the email when the user has no email (external/unknown)', async () => {
    mockRedis.exists.mockResolvedValue(0);
    mockUserRepo.findOne.mockResolvedValue(null);

    await service.create({ userId: 'ghost', type: 'new_follower' });

    expect(mockGateway.emitToUser).toHaveBeenCalled(); // in-app still happens
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  it('never throws if the email relay fails (best-effort)', async () => {
    mockRedis.exists.mockRejectedValue(new Error('redis down'));

    const result = await service.create({ userId: 'u1', type: 'new_follower' });

    expect(result).toMatchObject({ id: 'notif-1' });
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });
});
