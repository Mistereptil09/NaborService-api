import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Listing } from './entities/listing.entity';
import { MediaService } from '../media/services/media.service';
import { isModeratorOrAdmin } from '../../common/ownership';

@Injectable()
export class ListingMediaService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * List existing photos for a listing (public read, no ownership check).
   */
  async listMedia(
    listingId: string,
  ): Promise<{ id: string; order: number | null; caption: string | null }[]> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException('Annonce introuvable');
    }

    const photos = await this.mediaService.findByOwner(
      'listing_photo',
      listingId,
    );
    return photos.map((p) => ({
      id: p._id.toString(),
      order: p.order,
      caption: p.caption,
    }));
  }

  /**
   * Upload media for a listing. Delegates to the new MediaService.
   */
  async uploadMedia(
    userId: string,
    listingId: string,
    file: Express.Multer.File,
    userRole?: string,
  ): Promise<any> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException('Annonce introuvable');
    }

    if (listing.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Action non autorisée');
    }

    const media = await this.mediaService.upload(
      file,
      'listing_photo',
      listingId,
    );

    return {
      _id: media._id.toString(),
      mimetype: media.mimetype,
      size_bytes: media.size_bytes,
      order: media.order,
      uploaded_at: media.uploaded_at,
    };
  }

  /**
   * Delete media for a listing. Delegates to the new MediaService.
   */
  async deleteMedia(
    userId: string,
    listingId: string,
    mediaId: string,
    userRole?: string,
  ): Promise<void> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException('Annonce introuvable');
    }

    if (listing.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Action non autorisée');
    }

    const doc = await this.mediaService.findById(mediaId);
    if (doc.owner_id !== listingId || doc.owner_type !== 'listing_photo') {
      throw new NotFoundException('Média introuvable');
    }

    await this.mediaService.delete(mediaId);
  }
}
