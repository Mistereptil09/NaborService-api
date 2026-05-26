import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { Listing } from './entities/listing.entity';
import { ListingDocument, ListingDocumentDocument, Photo } from '../../database/mongo-schemas/schemas/listing-document.schema';
import { ListingsService } from './listings.service';

@Injectable()
export class ListingMediaService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectModel(ListingDocument.name)
    private readonly listingDocumentModel: Model<ListingDocumentDocument>,
    @Inject(forwardRef(() => ListingsService))
    private readonly listingsService: ListingsService,
  ) {}

  async uploadMedia(userId: string, listingId: string, file: Express.Multer.File): Promise<any> {
    const listing = await this.listingsService.findOne(listingId);

    if (listing.creatorId !== userId) {
      throw new ForbiddenException('Action non autorisée');
    }

    if (!file || !file.buffer) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    // Size limit check: 5MB
    if (file.size > 5242880) {
      throw new PayloadTooLargeException('La taille du fichier dépasse la limite autorisée de 5 Mo');
    }

    // Format check: JPEG, PNG, WebP
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException('Format de fichier non supporté (JPEG, PNG, WebP uniquement)');
    }

    let doc = await this.listingDocumentModel.findOne({ pg_listing_id: listingId });

    if (!doc) {
      doc = new this.listingDocumentModel({
        pg_listing_id: listingId,
        body_html: '',
        photos: [],
        tags: [],
        created_at: new Date(),
        updated_at: new Date(),
      });
      const savedDoc = await doc.save();
      listing.mongoDocumentId = savedDoc._id.toString();
      await this.listingRepository.save(listing);
    }

    if (doc.photos && doc.photos.length >= 8) {
      throw new ConflictException('Nombre maximum de photos atteint (8)');
    }

    // Convert to WebP via sharp
    let webpBuffer: Buffer;
    try {
      webpBuffer = await sharp(file.buffer).webp({ quality: 80 }).toBuffer();
    } catch (e) {
      throw new BadRequestException('Erreur lors du traitement de l\'image');
    }

    // Calculate incremental order
    const nextOrder = doc.photos.length > 0 ? Math.max(...doc.photos.map((p: any) => p.order)) + 1 : 0;

    const newPhoto: any = {
      data: webpBuffer,
      mimetype: 'image/webp',
      caption: null,
      size_bytes: webpBuffer.length,
      order: nextOrder,
      uploaded_at: new Date(),
    };

    doc.photos.push(newPhoto);
    doc.updated_at = new Date();
    const savedDoc = await doc.save();

    // Find the added photo to retrieve its _id
    const addedPhoto = savedDoc.photos.find((p: any) => p.order === nextOrder);
    
    return {
      _id: addedPhoto ? (addedPhoto as any)._id.toString() : undefined,
      mimetype: 'image/webp',
      size_bytes: webpBuffer.length,
      order: nextOrder,
      uploaded_at: newPhoto.uploaded_at,
    };
  }

  async deleteMedia(userId: string, listingId: string, mediaId: string): Promise<void> {
    const listing = await this.listingsService.findOne(listingId);

    if (listing.creatorId !== userId) {
      throw new ForbiddenException('Action non autorisée');
    }

    const doc = await this.listingDocumentModel.findOne({ pg_listing_id: listingId });
    if (!doc) {
      throw new NotFoundException('Contenu introuvable');
    }

    const photoIndex = doc.photos.findIndex((p: any) => p._id && p._id.toString() === mediaId);
    if (photoIndex === -1) {
      throw new NotFoundException('Média introuvable');
    }

    doc.photos.splice(photoIndex, 1);

    // Recalculate contiguous orders (0 to N-1)
    doc.photos.sort((a: any, b: any) => a.order - b.order);
    doc.photos.forEach((photo: any, index: number) => {
      photo.order = index;
    });

    doc.updated_at = new Date();
    await doc.save();
  }
}
