import { MediaController } from '../media.controller';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('MediaController — assertCanReadMedia (stream authorization)', () => {
  let controller: MediaController;
  let mockMediaService: any;
  let mockGridFSService: any;
  let mockListingRepo: any;
  let mockUserRepo: any;
  let mockMessageMetadataRepo: any;
  let mockUsersInGroupRepo: any;
  let mockListingTransactionRepo: any;
  let mockIncidentRepo: any;
  let mockEvenementRepo: any;
  let mockEventParticipantRepo: any;

  const user = (sub = 'u1', role = 'resident') => ({
    sub,
    email: 'a@b.c',
    role,
  });

  const assertCanRead = (doc: any, u: any) =>
    (controller as any).assertCanReadMedia(doc, u);

  beforeEach(() => {
    mockMediaService = {};
    mockGridFSService = {};
    mockListingRepo = {};
    mockUserRepo = {};
    mockMessageMetadataRepo = { findOne: jest.fn() };
    mockUsersInGroupRepo = { findOne: jest.fn() };
    mockListingTransactionRepo = { findOne: jest.fn() };
    mockIncidentRepo = { findOne: jest.fn() };
    mockEvenementRepo = { findOne: jest.fn() };
    mockEventParticipantRepo = { findOne: jest.fn() };

    controller = new MediaController(
      mockMediaService,
      mockGridFSService,
      mockListingRepo,
      mockUserRepo,
      mockMessageMetadataRepo,
      mockUsersInGroupRepo,
      mockListingTransactionRepo,
      mockIncidentRepo,
      mockEvenementRepo,
      mockEventParticipantRepo,
      {} as any,
      {} as any,
    );
  });

  describe('publicly-readable owner types', () => {
    it.each(['user_avatar', 'user_banner', 'listing_photo', 'event_cover'])(
      'allows any authenticated user to read %s with no repo lookups',
      async (owner_type) => {
        await expect(
          assertCanRead({ owner_type, owner_id: 'x' }, user('u1', 'resident')),
        ).resolves.toBeUndefined();
        expect(mockEvenementRepo.findOne).not.toHaveBeenCalled();
        expect(mockIncidentRepo.findOne).not.toHaveBeenCalled();
        expect(mockMessageMetadataRepo.findOne).not.toHaveBeenCalled();
        expect(mockListingTransactionRepo.findOne).not.toHaveBeenCalled();
      },
    );
  });

  describe('admin/moderator bypass', () => {
    it.each(['admin', 'moderator'])(
      'allows a %s role to read any owner_type without a repo lookup',
      async (role) => {
        await expect(
          assertCanRead(
            { owner_type: 'contract', owner_id: 'tx1' },
            user('u1', role),
          ),
        ).resolves.toBeUndefined();
        expect(mockListingTransactionRepo.findOne).not.toHaveBeenCalled();
      },
    );
  });

  describe('message_attachment', () => {
    it('allows an active group member', async () => {
      mockMessageMetadataRepo.findOne.mockResolvedValue({
        id: 'msg1',
        groupId: 'g1',
      });
      mockUsersInGroupRepo.findOne.mockResolvedValue({
        userId: 'u1',
        groupId: 'g1',
      });

      await expect(
        assertCanRead(
          { owner_type: 'message_attachment', owner_id: 'msg1' },
          user('u1'),
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects a non-member', async () => {
      mockMessageMetadataRepo.findOne.mockResolvedValue({
        id: 'msg1',
        groupId: 'g1',
      });
      mockUsersInGroupRepo.findOne.mockResolvedValue(null);

      await expect(
        assertCanRead(
          { owner_type: 'message_attachment', owner_id: 'msg1' },
          user('u9'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s when the message no longer exists', async () => {
      mockMessageMetadataRepo.findOne.mockResolvedValue(null);

      await expect(
        assertCanRead(
          { owner_type: 'message_attachment', owner_id: 'missing' },
          user('u1'),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('contract', () => {
    it('allows the provider party', async () => {
      mockListingTransactionRepo.findOne.mockResolvedValue({
        id: 'tx1',
        providerId: 'u1',
        requesterId: 'u2',
      });

      await expect(
        assertCanRead({ owner_type: 'contract', owner_id: 'tx1' }, user('u1')),
      ).resolves.toBeUndefined();
    });

    it('allows the requester party', async () => {
      mockListingTransactionRepo.findOne.mockResolvedValue({
        id: 'tx1',
        providerId: 'u1',
        requesterId: 'u2',
      });

      await expect(
        assertCanRead({ owner_type: 'contract', owner_id: 'tx1' }, user('u2')),
      ).resolves.toBeUndefined();
    });

    it('rejects an unrelated user', async () => {
      mockListingTransactionRepo.findOne.mockResolvedValue({
        id: 'tx1',
        providerId: 'u1',
        requesterId: 'u2',
      });

      await expect(
        assertCanRead({ owner_type: 'contract', owner_id: 'tx1' }, user('u9')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s when the transaction no longer exists', async () => {
      mockListingTransactionRepo.findOne.mockResolvedValue(null);

      await expect(
        assertCanRead(
          { owner_type: 'contract', owner_id: 'missing' },
          user('u1'),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('incident_photo', () => {
    it('allows the reporter', async () => {
      mockIncidentRepo.findOne.mockResolvedValue({
        id: 'inc1',
        reporterId: 'u1',
        assignedTo: null,
      });

      await expect(
        assertCanRead(
          { owner_type: 'incident_photo', owner_id: 'inc1' },
          user('u1'),
        ),
      ).resolves.toBeUndefined();
    });

    it('allows the assigned moderator', async () => {
      mockIncidentRepo.findOne.mockResolvedValue({
        id: 'inc1',
        reporterId: 'u2',
        assignedTo: 'u1',
      });

      await expect(
        assertCanRead(
          { owner_type: 'incident_photo', owner_id: 'inc1' },
          user('u1'),
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects a stranger', async () => {
      mockIncidentRepo.findOne.mockResolvedValue({
        id: 'inc1',
        reporterId: 'u2',
        assignedTo: null,
      });

      await expect(
        assertCanRead(
          { owner_type: 'incident_photo', owner_id: 'inc1' },
          user('u9'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('event_attachment', () => {
    it('allows the event creator', async () => {
      mockEvenementRepo.findOne.mockResolvedValue({
        id: 'ev1',
        creatorId: 'u1',
      });

      await expect(
        assertCanRead(
          { owner_type: 'event_attachment', owner_id: 'ev1' },
          user('u1'),
        ),
      ).resolves.toBeUndefined();
      expect(mockEventParticipantRepo.findOne).not.toHaveBeenCalled();
    });

    it('allows a registered (non-cancelled) participant', async () => {
      mockEvenementRepo.findOne.mockResolvedValue({
        id: 'ev1',
        creatorId: 'u2',
      });
      mockEventParticipantRepo.findOne.mockResolvedValue({
        userId: 'u1',
        eventId: 'ev1',
        status: 'registered',
      });

      await expect(
        assertCanRead(
          { owner_type: 'event_attachment', owner_id: 'ev1' },
          user('u1'),
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects a cancelled participant / stranger', async () => {
      mockEvenementRepo.findOne.mockResolvedValue({
        id: 'ev1',
        creatorId: 'u2',
      });
      mockEventParticipantRepo.findOne.mockResolvedValue(null);

      await expect(
        assertCanRead(
          { owner_type: 'event_attachment', owner_id: 'ev1' },
          user('u9'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s when the event no longer exists', async () => {
      mockEvenementRepo.findOne.mockResolvedValue(null);

      await expect(
        assertCanRead(
          { owner_type: 'event_attachment', owner_id: 'missing' },
          user('u1'),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
