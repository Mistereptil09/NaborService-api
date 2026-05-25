import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import sharp from 'sharp';
import { User } from './entities/user.entity';
import { UserMedia, UserMediaDocument } from '../../database/mongo-schemas/schemas/user-media.schema';

@Injectable()
export class UserMediaService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectModel(UserMedia.name)
    private readonly userMediaModel: Model<UserMediaDocument>,
  ) {}

  private validateFile(file: Express.Multer.File, type: 'avatar' | 'banner') {
    if (!file || !file.buffer) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException('Format de fichier non supporté (JPEG, PNG, WebP, GIF uniquement)');
    }

    const maxSize = type === 'avatar' ? 2097152 : 4194304; // 2MB or 4MB
    if (file.size > maxSize) {
      throw new PayloadTooLargeException(`Taille du fichier dépasse la limite autorisée de ${maxSize / (1024 * 1024)} Mo`);
    }
  }

  async uploadMedia(userId: string, file: Express.Multer.File, type: 'avatar' | 'banner'): Promise<string> {
    this.validateFile(file, type);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // 1. Process with sharp to WebP format
    let data: Buffer;
    let width_px: number;
    let height_px: number;
    let size_bytes: number;

    try {
      const sharpImg = sharp(file.buffer);
      const metadata = await sharpImg.metadata();
      width_px = metadata.width || 0;
      height_px = metadata.height || 0;

      const webpBuffer = await sharpImg.webp({ quality: 80 }).toBuffer();
      data = webpBuffer;
      size_bytes = webpBuffer.length;
    } catch (error) {
      throw new BadRequestException('Erreur lors du traitement de l\'image');
    }

    // 2. Handle replacement if old one exists
    const oldMedia = await this.userMediaModel.findOne({ pg_user_id: userId, type });
    if (oldMedia) {
      // Direct raw update to bypass enum validator and satisfy unique compound index { pg_user_id, type }
      await this.userMediaModel.updateOne(
        { _id: oldMedia._id },
        {
          $set: {
            replaced_at: new Date(),
            type: `${type}_replaced`,
          },
        },
      );
    }

    // 3. Save new media to MongoDB
    const newMedia = new this.userMediaModel({
      pg_user_id: userId,
      type,
      data,
      mimetype: 'image/webp',
      size_bytes,
      width_px,
      height_px,
      uploaded_at: new Date(),
    });
    const savedMedia = await newMedia.save();
    const mediaIdStr = savedMedia._id.toString();

    // 4. Update PostgreSQL Reference
    if (type === 'avatar') {
      user.profilePictureMongoId = mediaIdStr;
    } else {
      user.bannerMongoId = mediaIdStr;
    }
    await this.userRepository.save(user);

    return mediaIdStr;
  }

  async deleteMedia(userId: string, type: 'avatar' | 'banner'): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const targetId = type === 'avatar' ? user.profilePictureMongoId : user.bannerMongoId;

    if (!targetId) {
      throw new NotFoundException(`Aucun ${type} configuré pour cet utilisateur`);
    }

    const media = await this.userMediaModel.findOne({ pg_user_id: userId, type });
    if (!media) {
      throw new NotFoundException(`${type} introuvable dans la base de données`);
    }

    // Delete from MongoDB
    await this.userMediaModel.deleteOne({ _id: media._id });

    // Update PostgreSQL reference to null
    if (type === 'avatar') {
      user.profilePictureMongoId = null;
    } else {
      user.bannerMongoId = null;
    }
    await this.userRepository.save(user);
  }
}
