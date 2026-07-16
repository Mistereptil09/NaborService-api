import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  StreamableFile,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import {
  EventDocument,
  EventDocumentDocument,
} from '../../database/mongo-schemas/schemas/event-document.schema';
import { Evenement } from './entities/evenement.entity';
import { isModeratorOrAdmin } from '../../common/ownership';

@Injectable()
export class EventMediaService {
  private readonly ALLOWED_MIMES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ];

  constructor(
    @InjectModel(EventDocument.name)
    private readonly eventDocumentModel: Model<EventDocumentDocument>,
    @InjectRepository(Evenement)
    private readonly eventRepo: Repository<Evenement>,
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

    // multer/busboy decode multipart filename headers as latin1 regardless of
    // the browser's actual UTF-8 encoding — re-decode to fix accented filenames.
    file.originalname = Buffer.from(file.originalname, 'latin1').toString(
      'utf8',
    );

    if (!this.ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file format');
    }

    const isImage = file.mimetype.startsWith('image/');
    const isVideoOrPdf =
      file.mimetype.startsWith('video/') || file.mimetype === 'application/pdf';

    if (isImage && file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Image exceeds 5 MB limit');
    }
    if (isVideoOrPdf && file.size > 50 * 1024 * 1024) {
      throw new BadRequestException('Video/PDF exceeds 50 MB limit');
    }

    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Only the owner can upload media');
    }

    let document = await this.eventDocumentModel.findOne({
      pg_event_id: eventId,
    });
    if (!document) {
      document = new this.eventDocumentModel({
        pg_event_id: eventId,
        body_html: '',
        cover: null,
        programme: [],
        location: { address: null, geocode: null },
        attachments: [],
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    if (isImage && !document.cover) {
      // First image becomes cover
      const compressedBuffer = await sharp(file.buffer)
        .resize(1920, null, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      document.cover = {
        data: compressedBuffer,
        mimetype: 'image/webp',
        size_bytes: compressedBuffer.length,
      };
      document.updated_at = new Date();
      await document.save();

      return { type: 'cover', mimetype: 'image/webp', size_bytes: compressedBuffer.length };
    } else {
      // Attachments
      if (document.attachments.length >= 5) {
        throw new BadRequestException('Maximum 5 attachments allowed');
      }

      let bufferToSave = file.buffer;
      let mimetypeToSave = file.mimetype;
      let nameToSave = file.originalname;

      if (isImage) {
        bufferToSave = await sharp(file.buffer)
          .resize(1920, null, { withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        mimetypeToSave = 'image/webp';
        nameToSave = nameToSave.replace(/\.[^/.]+$/, '') + '.webp';
      }

      document.attachments.push({
        data: bufferToSave,
        name: nameToSave,
        mimetype: mimetypeToSave,
        size_bytes: bufferToSave.length,
        uploaded_at: new Date(),
      });
      document.updated_at = new Date();
      await document.save();

      return { type: 'attachment', name: nameToSave, mimetype: mimetypeToSave, size_bytes: bufferToSave.length };
    }
  }

  async getMedia(eventId: string, mediaId: string): Promise<{ data: Buffer; mimetype: string }> {
    const document = await this.eventDocumentModel.findOne({
      pg_event_id: eventId,
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (mediaId === 'cover') {
      if (!document.cover || !document.cover.data) {
        throw new NotFoundException('Cover not found');
      }
      return { data: document.cover.data, mimetype: document.cover.mimetype };
    }

    const attachment = document.attachments.find((a) => a.name === mediaId);
    if (!attachment) {
      throw new NotFoundException('Media not found');
    }
    return { data: attachment.data, mimetype: attachment.mimetype };
  }

  async deleteMedia(userId: string, eventId: string, mediaId: string, userRole?: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Only the owner can delete media');
    }

    const document = await this.eventDocumentModel.findOne({
      pg_event_id: eventId,
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (mediaId === 'cover') {
      document.cover = null;
    } else {
      const originalLength = document.attachments.length;
      document.attachments = document.attachments.filter(
        (a) => a.name !== mediaId,
      );
      if (document.attachments.length === originalLength) {
        throw new NotFoundException('Media not found');
      }
    }

    document.updated_at = new Date();
    await document.save();
    return { success: true };
  }
}
