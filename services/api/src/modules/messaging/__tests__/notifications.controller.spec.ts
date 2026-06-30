import { NotificationsController } from '../notifications.controller';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  const mockService = {
    getForUser: jest.fn().mockResolvedValue({ notifications: [], unreadCount: 3 }),
    getUnreadCount: jest.fn().mockResolvedValue(3),
    markAsRead: jest.fn().mockResolvedValue(undefined),
    markAllAsRead: jest.fn().mockResolvedValue(undefined),
  };
  const req = { user: { sub: 'u1' } };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new NotificationsController(mockService as any);
  });

  it('GET / returns paginated history + unreadCount', async () => {
    const res = await controller.list(req, '5', '20');
    expect(mockService.getForUser).toHaveBeenCalledWith('u1', 5, 20);
    expect(res).toEqual({ notifications: [], unreadCount: 3 });
  });

  it('GET / clamps invalid pagination to safe defaults', async () => {
    await controller.list(req, '-10', '999');
    expect(mockService.getForUser).toHaveBeenCalledWith('u1', 0, 100);
  });

  it('GET /unread-count returns the count', async () => {
    expect(await controller.unreadCount(req)).toEqual({ unreadCount: 3 });
  });

  it('PATCH /:id/read delegates to the service', async () => {
    await controller.markAsRead(req, 'notif-9');
    expect(mockService.markAsRead).toHaveBeenCalledWith('notif-9', 'u1');
  });

  it('PATCH /read-all delegates to the service', async () => {
    await controller.markAllAsRead(req);
    expect(mockService.markAllAsRead).toHaveBeenCalledWith('u1');
  });
});
