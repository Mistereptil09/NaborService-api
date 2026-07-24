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

  async upload(
    file: Express.Multer.File,
    ownerType: OwnerType,
    ownerId: string,
    options?: UploadOptions,
  ): Promise<MediaFileDocument> {
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

    const context = this.getUploadContext(ownerType, file.mimetype);
    const processed = await this.uploadPipeline.process(file, context);

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
      duration_seconds: processed.durationSeconds ?? null,
    });

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

    if (ownerType === 'user_avatar' && user) {
      user.profilePictureMongoId = savedDoc._id.toString();
      await this.userRepository.save(user);
    } else if (ownerType === 'user_banner' && user) {
      user.bannerMongoId = savedDoc._id.toString();
      await this.userRepository.save(user);
    }

    return savedDoc;
  }

  async delete(mediaId: string): Promise<void> {
    const doc = await this.mediaFileModel.findById(mediaId);
    if (!doc) {
      throw new NotFoundException('Média introuvable');
    }

    await this.mediaFileModel.deleteOne({ _id: doc._id });

    try {
      await this.gridfsService.delete(doc.gridfs_file_id);
    } catch (error) {
      const rollbackDoc = new this.mediaFileModel(doc.toObject());
      await rollbackDoc.save();
      throw new InternalServerErrorException(
        `File could not be removed; deletion rolled back: ${(error as Error).message}`,
      );
    }

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

  async findById(mediaId: string): Promise<MediaFileDocument> {
    const doc = await this.mediaFileModel.findById(mediaId);
    if (!doc) {
      throw new NotFoundException('Média introuvable');
    }
    return doc;
  }

  async findByOwner(
    ownerType: OwnerType,
    ownerId: string,
  ): Promise<MediaFileDocument[]> {
    return this.mediaFileModel
      .find({
        owner_type: ownerType,
        owner_id: ownerId,
      })
      .sort({ order: 1, uploaded_at: 1 });
  }

  async findCoverImages(
    ownerType: OwnerType,
    ownerIds: string[],
  ): Promise<Map<string, string>> {
    if (ownerIds.length === 0) return new Map();
    const docs = await this.mediaFileModel
      .find({ owner_type: ownerType, owner_id: { $in: ownerIds } })
      .sort({ order: 1, uploaded_at: 1 })
      .lean();

    const covers = new Map<string, string>();
    for (const doc of docs) {
      if (!covers.has(doc.owner_id)) {
        covers.set(doc.owner_id, doc._id.toString());
      }
    }
    return covers;
  }

  async reorderListingPhotos(
    listingId: string,
    mediaIds: string[],
  ): Promise<void> {
    const existingPhotos = await this.mediaFileModel.find({
      owner_type: 'listing_photo',
      owner_id: listingId,
    });

    const existingIds = existingPhotos.map((p) => p._id.toString());

    const uniqueIds = new Set(mediaIds);
    if (uniqueIds.size !== mediaIds.length) {
      throw new BadRequestException(
        'Reorder array is invalid: contains duplicate IDs',
      );
    }

    if (mediaIds.length !== existingIds.length) {
      throw new BadRequestException(
        'Reorder array is invalid: does not match existing photos count',
      );
    }

    for (const id of mediaIds) {
      if (!existingIds.includes(id)) {
        throw new BadRequestException(
          `Reorder array is invalid: photo ${id} does not belong to listing`,
        );
      }
    }

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
