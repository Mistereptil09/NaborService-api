import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  PayloadTooLargeException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { MediaFile, MediaFileDocument } from '../schemas/media-file.schema';
import { Listing } from '../../listings/entities/listing.entity';
import { User } from '../../users/entities/user.entity';
import { GridFSService } from './gridfs.service';
import { UploadPipeline } from './upload-pipeline.service';
import { OwnerType, UploadOptions, UploadContext } from '../interfaces';

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(MediaFile.name)
    private readonly mediaFileModel: Model<MediaFileDocument>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly gridfsService: GridFSService,
    private readonly uploadPipeline: UploadPipeline,
  ) {}

  /**
   * Helper function to build upload context specifications based on the owner type and incoming file mimetype.
   */
  getUploadContext(ownerType: OwnerType, mimetype: string): UploadContext {
    let allowedMimeTypes: string[] = [];
    let maxSizeBytes = 52428800; // 50MB default

    const standardImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    const standardVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    // webm/opus (Chrome), ogg/opus (Firefox) et mp4/AAC (Safari) couvrent les
    // sorties MediaRecorder des messages vocaux enregistrés dans le navigateur.
    const standardAudioTypes = [
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/webm',
      'audio/mp4',
    ];
    const standardDocTypes = ['application/pdf'];

    const messageAllTypes = [
      ...standardImageTypes,
      ...standardDocTypes,
      ...standardAudioTypes,
      ...standardVideoTypes,
    ];

    switch (ownerType) {
      case 'user_avatar':
        allowedMimeTypes = standardImageTypes;
        maxSizeBytes = 2097152; // 2MB
        break;
      case 'user_banner':
        allowedMimeTypes = standardImageTypes;
        maxSizeBytes = 4194304; // 4MB
        break;
      case 'listing_photo':
        allowedMimeTypes = standardImageTypes;
        maxSizeBytes = 5242880; // 5MB
        break;
      case 'event_cover':
        allowedMimeTypes = standardImageTypes;
        maxSizeBytes = 5242880; // 5MB
        break;
      case 'event_attachment':
        allowedMimeTypes = messageAllTypes;
        maxSizeBytes = 52428800; // 50MB
        break;
      case 'incident_photo':
        allowedMimeTypes = standardImageTypes;
        maxSizeBytes = 5242880; // 5MB
        break;
      case 'message_attachment':
        allowedMimeTypes = messageAllTypes;
        maxSizeBytes = mimetype.startsWith('image/') ? 5242880 : 52428800;
        break;
      case 'contract':
        allowedMimeTypes = standardDocTypes;
        maxSizeBytes = 52428800; // 50MB
        break;
    }

    return {
      ownerType,
      maxSizeBytes,
      allowedMimeTypes,
    };
  }

  /**
   * Upload a file for a specific owner entity.
   */
  async upload(
    file: Express.Multer.File,
    ownerType: OwnerType,
    ownerId: string,
    options?: UploadOptions,
  ): Promise<MediaFileDocument> {
    // 1. Enforce max count limits before calling UploadPipeline
    if (ownerType === 'listing_photo') {
      const count = await this.mediaFileModel.countDocuments({
        owner_type: 'listing_photo',
        owner_id: ownerId,
      });
      if (count >= 8) {
        throw new ConflictException('Nombre maximum de photos atteint (8)');
      }
    } else if (ownerType === 'message_attachment') {
      const count = await this.mediaFileModel.countDocuments({
        owner_type: 'message_attachment',
        owner_id: ownerId,
      });
      if (count >= 3) {
        throw new ConflictException(
          'Nombre maximum de pièces jointes atteint (3)',
        );
      }
    }

    // 2. Enforce duplicate contracts checking
    if (ownerType === 'contract') {
      const sha256 = crypto
        .createHash('sha256')
        .update(file.buffer)
        .digest('hex');
      const duplicate = await this.mediaFileModel.findOne({
        owner_type: 'contract',
        sha256_hash: sha256,
      });
      if (duplicate) {
        throw new ConflictException(
          'Duplicate document: a contract with identical content already exists',
        );
      }
    }

    // 3. Enforce event aggregate size check
    if (ownerType === 'event_cover' || ownerType === 'event_attachment') {
      const existingMedia = await this.mediaFileModel.find({
        owner_id: ownerId,
        owner_type: { $in: ['event_cover', 'event_attachment'] },
      });
      const currentTotalBytes = existingMedia.reduce(
        (sum, item) => sum + item.size_bytes,
        0,
      );
      if (currentTotalBytes + file.size > 14155776) {
        throw new PayloadTooLargeException(
          'Combined media size for this event would exceed 13.5 MB',
        );
      }
    }

    // 4. Handle replacement singleton logic for User avatar/banner & Event covers
    let user: User | null = null;
    if (ownerType === 'user_avatar' || ownerType === 'user_banner') {
      user = await this.userRepository.findOne({ where: { id: ownerId } });
      if (!user) {
        throw new NotFoundException('Utilisateur introuvable');
      }
      const oldMedia = await this.mediaFileModel.findOne({
        owner_type: ownerType,
        owner_id: ownerId,
      });
      if (oldMedia) {
        await this.delete(oldMedia._id.toString());
      }
    } else if (ownerType === 'event_cover') {
      const oldMedia = await this.mediaFileModel.findOne({
        owner_type: 'event_cover',
        owner_id: ownerId,
      });
      if (oldMedia) {
        await this.delete(oldMedia._id.toString());
      }
    }

    // 5. Get Upload Context & Process through Pipeline
    const context = this.getUploadContext(ownerType, file.mimetype);
    const processed = await this.uploadPipeline.process(file, context);

    // 6. Save new MediaFile document to MongoDB
    const mediaDoc = new this.mediaFileModel({
      owner_type: ownerType,
      owner_id: ownerId,
      gridfs_file_id: processed.gridfsFileId,
      mimetype: processed.mimetype,
      size_bytes: processed.sizeBytes,
      original_filename: processed.originalFilename,
      uploaded_at: new Date(),
      width_px: processed.widthPx || null,
      height_px: processed.heightPx || null,
    });

    // Handle context-specific additional fields
    if (ownerType === 'listing_photo') {
      const existingPhotos = await this.mediaFileModel.find({
        owner_type: 'listing_photo',
        owner_id: ownerId,
      });
      const maxOrder =
        existingPhotos.length > 0
          ? Math.max(...existingPhotos.map((p) => p.order || 0))
          : -1;
      mediaDoc.order = maxOrder + 1;
      mediaDoc.caption = options?.caption || null;
    } else if (ownerType === 'contract') {
      mediaDoc.sha256_hash = crypto
        .createHash('sha256')
        .update(file.buffer)
        .digest('hex');
      mediaDoc.contract_type = options?.contractType || 'contract';
    } else if (ownerType === 'incident_photo') {
      mediaDoc.taken_at = options?.takenAt || new Date();
      mediaDoc.synced_at = options?.syncedAt || new Date();
    }

    const savedDoc = await mediaDoc.save();

    // 7. Update PostgreSQL user references
    if (ownerType === 'user_avatar' && user) {
      user.profilePictureMongoId = savedDoc._id.toString();
      await this.userRepository.save(user);
    } else if (ownerType === 'user_banner' && user) {
      user.bannerMongoId = savedDoc._id.toString();
      await this.userRepository.save(user);
    }

    return savedDoc;
  }

  /**
   * Delete a media file (metadata + GridFS file cascade).
   */
  async delete(mediaId: string): Promise<void> {
    const doc = await this.mediaFileModel.findById(mediaId);
    if (!doc) {
      throw new NotFoundException('Média introuvable');
    }

    // Delete metadata first
    await this.mediaFileModel.deleteOne({ _id: doc._id });

    try {
      // Cascade delete referenced GridFS file
      await this.gridfsService.delete(doc.gridfs_file_id);
    } catch (error) {
      // Rollback metadata deletion if GridFS delete fails
      const rollbackDoc = new this.mediaFileModel(doc.toObject());
      await rollbackDoc.save();
      throw new InternalServerErrorException(
        `File could not be removed; deletion rolled back: ${(error as Error).message}`,
      );
    }

    // Clean up PostgreSQL references if user media is deleted
    if (doc.owner_type === 'user_avatar') {
      const user = await this.userRepository.findOne({
        where: { id: doc.owner_id },
      });
      if (user) {
        user.profilePictureMongoId = null;
        await this.userRepository.save(user);
      }
    } else if (doc.owner_type === 'user_banner') {
      const user = await this.userRepository.findOne({
        where: { id: doc.owner_id },
      });
      if (user) {
        user.bannerMongoId = null;
        await this.userRepository.save(user);
      }
    }

    // Recalculate contiguous order values (0 to N-1) for listing photos
    if (doc.owner_type === 'listing_photo') {
      const remainingPhotos = await this.mediaFileModel.find({
        owner_type: 'listing_photo',
        owner_id: doc.owner_id,
      });

      remainingPhotos.sort((a, b) => (a.order || 0) - (b.order || 0));
      for (let i = 0; i < remainingPhotos.length; i++) {
        remainingPhotos[i].order = i;
        await remainingPhotos[i].save();
      }
    }
  }

  /**
   * Get metadata for a media file.
   */
  async findById(mediaId: string): Promise<MediaFileDocument> {
    const doc = await this.mediaFileModel.findById(mediaId);
    if (!doc) {
      throw new NotFoundException('Média introuvable');
    }
    return doc;
  }

  /**
   * Get all media files for an owner.
   */
  async findByOwner(
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<MediaFileDocument[]> {
    return this.mediaFileModel.find({
      owner_type: ownerType,
      owner_id: ownerId,
    });
  }

  /**
   * Reorder listing photos.
   */
  async reorderListingPhotos(
    listingId: string,
    mediaIds: string[],
  ): Promise<void> {
    const existingPhotos = await this.mediaFileModel.find({
      owner_type: 'listing_photo',
      owner_id: listingId,
    });

    const existingIds = existingPhotos.map((p) => p._id.toString());

    // Validation: check for duplicates
    const uniqueIds = new Set(mediaIds);
    if (uniqueIds.size !== mediaIds.length) {
      throw new BadRequestException(
        'Reorder array is invalid: contains duplicate IDs',
      );
    }

    // Validation: check size matches existing photos count exactly
    if (mediaIds.length !== existingIds.length) {
      throw new BadRequestException(
        'Reorder array is invalid: does not match existing photos count',
      );
    }

    // Validation: check all mediaIds belong to this listing
    for (const id of mediaIds) {
      if (!existingIds.includes(id)) {
        throw new BadRequestException(
          `Reorder array is invalid: photo ${id} does not belong to listing`,
        );
      }
    }

    // Assign contiguous orders matching Permutation index
    for (let i = 0; i < mediaIds.length; i++) {
      const photo = existingPhotos.find(
        (p) => p._id.toString() === mediaIds[i],
      );
      if (photo) {
        photo.order = i;
        await photo.save();
      }
    }
  }

  /**
   * Update listing photo caption.
   */
  async updateCaption(mediaId: string, caption: string | null): Promise<void> {
    const photo = await this.mediaFileModel.findById(mediaId);
    if (!photo || photo.owner_type !== 'listing_photo') {
      throw new NotFoundException("Photo de l'annonce introuvable");
    }

    if (caption && caption.length > 280) {
      throw new BadRequestException('Caption must be 280 characters or less');
    }

    photo.caption = caption;
    await photo.save();
  }
}
