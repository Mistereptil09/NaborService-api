import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { EventMediaService } from '../event-media.service';
import { EventDocument } from '../../../database/mongo-schemas/schemas/event-document.schema';
import { Evenement } from '../entities/evenement.entity';

describe('EventMediaService', () => {
  let service: EventMediaService;
  let mockEventRepo: any;
  let mockDocModel: any;

  beforeEach(async () => {
    mockEventRepo = { findOne: jest.fn() };
    mockDocModel = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventMediaService,
        { provide: getModelToken(EventDocument.name), useValue: mockDocModel },
        { provide: getRepositoryToken(Evenement), useValue: mockEventRepo },
      ],
    }).compile();

    service = module.get<EventMediaService>(EventMediaService);
    jest.clearAllMocks();
  });

  describe('listMedia', () => {
    it('should return cover then attachments in { id, order, caption } form', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1' });
      mockDocModel.findOne.mockResolvedValue({
        cover: {
          data: Buffer.from('x'),
          mimetype: 'image/webp',
          size_bytes: 1,
        },
        attachments: [
          { name: 'photo.webp', mimetype: 'image/webp' },
          { name: 'flyer.pdf', mimetype: 'application/pdf' },
        ],
      });

      const result = await service.listMedia('evt-1');

      expect(result).toEqual([
        { id: 'cover', order: 0, caption: null },
        { id: 'photo.webp', order: 1, caption: null },
        { id: 'flyer.pdf', order: 2, caption: null },
      ]);
    });

    it('should omit the cover entry when there is no cover', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1' });
      mockDocModel.findOne.mockResolvedValue({
        cover: null,
        attachments: [{ name: 'flyer.pdf', mimetype: 'application/pdf' }],
      });

      const result = await service.listMedia('evt-1');

      expect(result).toEqual([{ id: 'flyer.pdf', order: 1, caption: null }]);
    });

    it('should return an empty array when the event has no document', async () => {
      mockEventRepo.findOne.mockResolvedValue({ id: 'evt-1' });
      mockDocModel.findOne.mockResolvedValue(null);

      await expect(service.listMedia('evt-1')).resolves.toEqual([]);
    });

    it('should throw NotFoundException when the event does not exist', async () => {
      mockEventRepo.findOne.mockResolvedValue(null);

      await expect(service.listMedia('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findCoverMediaIds', () => {
    it('should map only events that have a cover to the "cover" id', async () => {
      mockDocModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { pg_event_id: 'evt-1', cover: { size_bytes: 10 } },
          { pg_event_id: 'evt-2', cover: null },
        ]),
      });

      const result = await service.findCoverMediaIds(['evt-1', 'evt-2']);

      expect(result.get('evt-1')).toBe('cover');
      expect(result.has('evt-2')).toBe(false);
    });

    it('should return an empty map for an empty id list without querying', async () => {
      const result = await service.findCoverMediaIds([]);

      expect(result.size).toBe(0);
      expect(mockDocModel.find).not.toHaveBeenCalled();
    });
  });
});
