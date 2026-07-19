import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evenement } from './entities/evenement.entity';
import { MediaService } from '../media/services/media.service';
import { isModeratorOrAdmin } from '../../common/ownership';

@Injectable()
export class EventMediaService {
  constructor(
    @InjectRepository(Evenement)
    private readonly eventRepo: Repository<Evenement>,
    private readonly mediaService: MediaService,
  ) {}

  async uploadMedia(
    userId: string,
    eventId: string,
    file: Express.Multer.File,
    userRole?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Only the owner can upload media');
    }

    const isImage = file.mimetype.startsWith('image/');
    const existingCover = await this.mediaService.findByOwner(
      'event_cover',
      eventId,
    );
    const ownerType =
      isImage && existingCover.length === 0 ? 'event_cover' : 'event_attachment';

    const media = await this.mediaService.upload(file, ownerType, eventId);

    return {
      type: ownerType === 'event_cover' ? 'cover' : 'attachment',
      id: media._id.toString(),
      mimetype: media.mimetype,
      size_bytes: media.size_bytes,
    };
  }

  /**
   * List existing media for an event (public read, no ownership check),
   * mirroring the listings media contract ({ id, order, caption }).
   */
  async listMedia(
    eventId: string,
  ): Promise<{ id: string; order: number | null; caption: string | null }[]> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const [cover] = await this.mediaService.findByOwner('event_cover', eventId);
    const attachments = await this.mediaService.findByOwner(
      'event_attachment',
      eventId,
    );

    const media: {
      id: string;
      order: number | null;
      caption: string | null;
    }[] = [];
    if (cover) {
      media.push({ id: cover._id.toString(), order: 0, caption: null });
    }
    attachments.forEach((a, index) => {
      media.push({ id: a._id.toString(), order: index + 1, caption: null });
    });
    return media;
  }

  async deleteMedia(
    userId: string,
    eventId: string,
    mediaId: string,
    userRole?: string,
  ) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Only the owner can delete media');
    }

    const doc = await this.mediaService.findById(mediaId);
    if (
      (doc.owner_type !== 'event_cover' &&
        doc.owner_type !== 'event_attachment') ||
      doc.owner_id !== eventId
    ) {
      throw new NotFoundException('Media not found');
    }

    await this.mediaService.delete(mediaId);
  }

  /**
   * Cover identifier per event, batched for a page of events — one query for
   * the whole feed instead of one media call per card.
   */
  async findCoverMediaIds(eventIds: string[]): Promise<Map<string, string>> {
    if (eventIds.length === 0) return new Map();
    return this.mediaService.findCoverImages('event_cover', eventIds);
  }
}
