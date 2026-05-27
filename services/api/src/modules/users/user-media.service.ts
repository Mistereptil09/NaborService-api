import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaService } from '../media/services/media.service';

@Injectable()
export class UserMediaService {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Upload user avatar or banner. Delegates to the new MediaService.
   */
  async uploadMedia(userId: string, file: Express.Multer.File, type: 'avatar' | 'banner'): Promise<string> {
    const ownerType = type === 'avatar' ? 'user_avatar' : 'user_banner';
    const media = await this.mediaService.upload(file, ownerType, userId);
    return media._id.toString();
  }

  /**
   * Delete user avatar or banner. Delegates to the new MediaService.
   */
  async deleteMedia(userId: string, type: 'avatar' | 'banner'): Promise<void> {
    const ownerType = type === 'avatar' ? 'user_avatar' : 'user_banner';
    const existing = await this.mediaService.findByOwner(ownerType, userId);
    if (existing.length === 0) {
      throw new NotFoundException(`Aucun ${type} configuré pour cet utilisateur`);
    }
    await this.mediaService.delete(existing[0]._id.toString());
  }
}
