import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { EventMediaService } from '../event-media.service';
import { Evenement } from '../entities/evenement.entity';
import { MediaService } from '../../media/services/media.service';
import { GridFSService } from '../../media/services/gridfs.service';

describe('EventMediaService', () => {
  let service: EventMediaService;
  let mockEventRepo: any;
  let mockMediaService: any;
  let mockGridfsService: any;

  beforeEach(async () => {
    mockEventRepo = { findOne: jest.fn() };
    mockMediaService = {
      upload: jest.fn(),
      findByOwner: jest.fn(),
      findById: jest.fn(),
      findCoverImages: jest.fn(),
      delete: jest.fn(),
    };
    mockGridfsService = {
      download: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventMediaService,
        { provide: getRepositoryToken(Evenement), useValue: mockEventRepo },
        { provide: MediaService, useValue: mockMediaService },
        { provide: GridFSService, useValue: mockGridfsService },
      ],
    }).compile();

    service = module.get<EventMediaService>(EventMediaService);
    jest.clearAllMocks();
  });

  describe('uploadMedia', () => {
    it('should upload a cover when no cover exists and file is an image', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1', creatorId: 'u1' });
      mockMediaService.findByOwner.mockResolvedValue([]);
      mockMediaService.upload.mockResolvedValue({
        _id: { toString: () => 'media-1' },
        mimetype: 'image/webp',
        size_bytes: 100,
      });

      const result = await service.uploadMedia('u1', 'evt-1', {
        mimetype: 'image/jpeg',
      } as Express.Multer.File);

      expect(mockMediaService.upload).toHaveBeenCalledWith(
        expect.anything(),
        'event_cover',
        'evt-1',
      );
      expect(result).toEqual({
        type: 'cover',
        id: 'media-1',
        mimetype: 'image/webp',
        size_bytes: 100,
      });
    });

    it('should upload an attachment when a cover already exists', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1', creatorId: 'u1' });
      mockMediaService.findByOwner.mockResolvedValue([
        { _id: { toString: () => 'existing' } },
      ]);
      mockMediaService.upload.mockResolvedValue({
        _id: { toString: () => 'media-2' },
        mimetype: 'image/webp',
        size_bytes: 200,
      });

      const result = await service.uploadMedia('u1', 'evt-1', {
        mimetype: 'image/png',
      } as Express.Multer.File);

      expect(mockMediaService.upload).toHaveBeenCalledWith(
        expect.anything(),
        'event_attachment',
        'evt-1',
      );
      expect(result.type).toBe('attachment');
    });

    it('should reject upload by non-owner/non-admin', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1', creatorId: 'u1' });

      await expect(
        service.uploadMedia('u2', 'evt-1', {
          mimetype: 'image/jpeg',
        } as Express.Multer.File),
      ).rejects.toThrow('Only the owner can upload media');
    });
  });

  describe('listMedia', () => {
    it('should return cover then attachments in { id, order, caption } form', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1' });
      mockMediaService.findByOwner.mockImplementation((ownerType: string) => {
        if (ownerType === 'event_cover') {
          return [{ _id: { toString: () => 'cover-id' } }];
        }
        return [
          { _id: { toString: () => 'att-1' } },
          { _id: { toString: () => 'att-2' } },
        ];
      });

      const result = await service.listMedia('evt-1');

      expect(result).toEqual([
        { id: 'cover-id', order: 0, caption: null },
        { id: 'att-1', order: 1, caption: null },
        { id: 'att-2', order: 2, caption: null },
      ]);
    });

    it('should omit the cover entry when there is no cover', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1' });
      mockMediaService.findByOwner.mockImplementation((ownerType: string) => {
        if (ownerType === 'event_cover') {
          return [];
        }
        return [{ _id: { toString: () => 'att-1' } }];
      });

      const result = await service.listMedia('evt-1');

      expect(result).toEqual([{ id: 'att-1', order: 1, caption: null }]);
    });

    it('should throw NotFoundException when the event does not exist', async () => {
      mockEventRepo.findOne.mockResolvedValue(null);

      await expect(service.listMedia('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findCoverMediaIds', () => {
    it('should map event ids to their cover media id', async () => {
      mockMediaService.findCoverImages.mockResolvedValue(
        new Map([['evt-1', 'cover-id']]),
      );

      const result = await service.findCoverMediaIds(['evt-1', 'evt-2']);

      expect(result.get('evt-1')).toBe('cover-id');
      expect(mockMediaService.findCoverImages).toHaveBeenCalledWith(
        'event_cover',
        ['evt-1', 'evt-2'],
      );
    });

    it('should return an empty map for an empty id list without querying', async () => {
      const result = await service.findCoverMediaIds([]);

      expect(result.size).toBe(0);
      expect(mockMediaService.findCoverImages).not.toHaveBeenCalled();
    });
  });

  describe('getMedia', () => {
    it('should return buffer and mimetype for event media', async () => {
      mockMediaService.findById.mockResolvedValue({
        owner_type: 'event_cover',
        owner_id: 'evt-1',
        mimetype: 'image/webp',
        gridfs_file_id: 'gridfs-1',
      });
      mockGridfsService.download.mockResolvedValue({
        buffer: Buffer.from('image-data'),
      });

      const result = await service.getMedia('evt-1', 'media-1');

      expect(result.data).toEqual(Buffer.from('image-data'));
      expect(result.mimetype).toBe('image/webp');
    });

    it('should throw NotFoundException when media does not belong to event', async () => {
      mockMediaService.findById.mockResolvedValue({
        owner_type: 'event_cover',
        owner_id: 'evt-2',
        mimetype: 'image/webp',
        gridfs_file_id: 'gridfs-1',
      });

      await expect(service.getMedia('evt-1', 'media-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteMedia', () => {
    it('should delete media for event owner', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1', creatorId: 'u1' });
      mockMediaService.findById.mockResolvedValue({
        owner_type: 'event_attachment',
        owner_id: 'evt-1',
      });

      await service.deleteMedia('u1', 'evt-1', 'media-1');

      expect(mockMediaService.delete).toHaveBeenCalledWith('media-1');
    });

    it('should allow admin to delete media', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1', creatorId: 'u1' });
      mockMediaService.findById.mockResolvedValue({
        owner_type: 'event_attachment',
        owner_id: 'evt-1',
      });

      await service.deleteMedia('u2', 'evt-1', 'media-1', 'admin');

      expect(mockMediaService.delete).toHaveBeenCalledWith('media-1');
    });
  });
});
