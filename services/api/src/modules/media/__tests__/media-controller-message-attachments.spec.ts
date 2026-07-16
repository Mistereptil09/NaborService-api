import { MediaController } from '../media.controller';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('MediaController — message_attachment authorization', () => {
  let controller: MediaController;
  let mockMediaService: any;
  let mockGridFSService: any;
  let mockListingRepo: any;
  let mockUserRepo: any;
  let mockMessageMetadataRepo: any;
  let mockUsersInGroupRepo: any;

  const req = (userId = 'u1', role = 'resident') => ({ user: { sub: userId, email: 'a@b.c', role } });

  beforeEach(() => {
    mockMediaService = { upload: jest.fn().mockResolvedValue({ _id: 'media1' }), findById: jest.fn(), delete: jest.fn() };
    mockGridFSService = {};
    mockListingRepo = {};
    mockUserRepo = {};
    mockMessageMetadataRepo = { findOne: jest.fn() };
    mockUsersInGroupRepo = { findOne: jest.fn() };

    controller = new MediaController(
      mockMediaService,
      mockGridFSService,
      mockListingRepo,
      mockUserRepo,
      mockMessageMetadataRepo,
      mockUsersInGroupRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  describe('uploadMessageAttachment', () => {
    it('should upload when the requester is a member of the message group', async () => {
      mockMessageMetadataRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2' });
      mockUsersInGroupRepo.findOne.mockResolvedValue({ userId: 'u1', groupId: 'g1' });

      const file = {} as Express.Multer.File;
      const result = await controller.uploadMessageAttachment(req('u1') as any, 'msg1', file);

      expect(result).toEqual({ _id: 'media1' });
      expect(mockMediaService.upload).toHaveBeenCalledWith(file, 'message_attachment', 'msg1');
    });

    it('should reject a non-member of the message group', async () => {
      mockMessageMetadataRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2' });
      mockUsersInGroupRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.uploadMessageAttachment(req('u9') as any, 'msg1', {} as Express.Multer.File),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMediaService.upload).not.toHaveBeenCalled();
    });

    it('should 404 when the message does not exist', async () => {
      mockMessageMetadataRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.uploadMessageAttachment(req('u1') as any, 'missing', {} as Express.Multer.File),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMedia — message_attachment branch', () => {
    it('should allow the message sender to delete', async () => {
      mockMediaService.findById.mockResolvedValue({ owner_type: 'message_attachment', owner_id: 'msg1' });
      mockMessageMetadataRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u1' });

      const result = await controller.deleteMedia(req('u1') as any, 'media1');
      expect(result).toEqual({ success: true });
      expect(mockMediaService.delete).toHaveBeenCalledWith('media1');
    });

    it('should allow a group admin (non-sender) to delete', async () => {
      mockMediaService.findById.mockResolvedValue({ owner_type: 'message_attachment', owner_id: 'msg1' });
      mockMessageMetadataRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2' });
      mockUsersInGroupRepo.findOne.mockResolvedValue({ userId: 'u1', groupId: 'g1', roleInGroup: 'admin' });

      const result = await controller.deleteMedia(req('u1') as any, 'media1');
      expect(result).toEqual({ success: true });
    });

    it('should reject a non-sender, non-admin member', async () => {
      mockMediaService.findById.mockResolvedValue({ owner_type: 'message_attachment', owner_id: 'msg1' });
      mockMessageMetadataRepo.findOne.mockResolvedValue({ id: 'msg1', groupId: 'g1', senderId: 'u2' });
      mockUsersInGroupRepo.findOne.mockResolvedValue({ userId: 'u1', groupId: 'g1', roleInGroup: 'message' });

      await expect(controller.deleteMedia(req('u1') as any, 'media1')).rejects.toThrow(ForbiddenException);
      expect(mockMediaService.delete).not.toHaveBeenCalled();
    });
  });
});
