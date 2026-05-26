import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Listing } from './entities/listing.entity';
import { ListingDocument, ListingDocumentDocument } from '../../database/mongo-schemas/schemas/listing-document.schema';
import { UpdateContentDto } from './dto/listing-routes.dtos';
import { ListingStatusEnum } from '../../common/enums';
import { ListingsService } from './listings.service';

@Injectable()
export class ListingContentService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectModel(ListingDocument.name)
    private readonly listingDocumentModel: Model<ListingDocumentDocument>,
    @Inject(forwardRef(() => ListingsService))
    private readonly listingsService: ListingsService,
  ) {}

  async getContent(listingId: string): Promise<any> {
    const listing = await this.listingsService.findOne(listingId);
    if (!listing.mongoDocumentId) {
      throw new NotFoundException('Contenu introuvable');
    }

    const doc = await this.listingDocumentModel.findOne({ pg_listing_id: listingId }).lean();
    if (!doc) {
      throw new NotFoundException('Contenu introuvable');
    }

    // Exclude photo binary data
    if (doc.photos) {
      doc.photos = doc.photos.map((p: any) => {
        const { data, ...rest } = p;
        return {
          ...rest,
          // Convert mongo ObjectId/id to string if present
          _id: p._id ? p._id.toString() : undefined,
        };
      });
    }

    return {
      ...doc,
      _id: doc._id.toString(),
    };
  }

  async updateContent(userId: string, listingId: string, dto: UpdateContentDto): Promise<any> {
    const listing = await this.listingsService.findOne(listingId);

    if (listing.creatorId !== userId) {
      throw new ForbiddenException('Action non autorisée');
    }

    if (listing.status !== ListingStatusEnum.OPEN) {
      throw new ConflictException('Modification impossible : l\'annonce n\'est plus ouverte');
    }

    let doc = await this.listingDocumentModel.findOne({ pg_listing_id: listingId });

    if (doc) {
      if (dto.body_html !== undefined) doc.body_html = dto.body_html;
      if (dto.tags !== undefined) doc.tags = dto.tags;
      doc.updated_at = new Date();
      await doc.save();
    } else {
      doc = new this.listingDocumentModel({
        pg_listing_id: listingId,
        body_html: dto.body_html || '',
        photos: [],
        tags: dto.tags || [],
        created_at: new Date(),
        updated_at: new Date(),
      });
      const savedDoc = await doc.save();
      
      listing.mongoDocumentId = savedDoc._id.toString();
      await this.listingRepository.save(listing);
    }

    const leanDoc = await this.listingDocumentModel.findById(doc._id).lean();
    if (!leanDoc) {
      throw new NotFoundException('Contenu introuvable');
    }
    if (leanDoc.photos) {
      leanDoc.photos = leanDoc.photos.map((p: any) => {
        const { data, ...rest } = p;
        return { ...rest, _id: p._id ? p._id.toString() : undefined };
      });
    }

    return {
      ...leanDoc,
      _id: leanDoc._id.toString(),
    };
  }
}
