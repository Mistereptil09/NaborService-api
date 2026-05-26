import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Listing } from './entities/listing.entity';
import { CreateListingDto, UpdateListingDto, ListListingsDto } from './dto/listing-routes.dtos';
import { ListingStatusEnum, ListingTypeEnum } from '../../common/enums';

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @Inject('BullQueue_neo4j-sync')
    private readonly neo4jSyncQueue: { add: (name: string, data: any) => Promise<any> },
  ) {}

  async list(dto: ListListingsDto): Promise<{ data: Listing[]; total: number }> {
    const query = this.listingRepository.createQueryBuilder('listing')
      .where('listing.deletedAt IS NULL');

    if (dto.neighbourhood) {
      query.andWhere('listing.neighbourhoodId = :neighbourhood', { neighbourhood: dto.neighbourhood });
    }

    if (dto.category !== undefined) {
      query.andWhere('listing.categoryId = :category', { category: dto.category });
    }

    if (dto.type) {
      query.andWhere('listing.listingType = :type', { type: dto.type });
    }

    // Default status to open if not specified
    const statusFilter = dto.status || ListingStatusEnum.OPEN;
    query.andWhere('listing.status = :status', { status: statusFilter });

    query.orderBy('listing.createdAt', 'DESC')
      .skip(dto.offset)
      .take(dto.limit);

    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  async create(creatorId: string, dto: CreateListingDto): Promise<Listing> {
    if (!dto.title || dto.title.trim() === '') {
      throw new BadRequestException('Le titre est obligatoire');
    }
    if (dto.listing_type !== ListingTypeEnum.OFFER && dto.listing_type !== ListingTypeEnum.REQUEST) {
      throw new BadRequestException('Type d\'annonce invalide');
    }
    if (dto.price_cents !== undefined && dto.price_cents < 0) {
      throw new BadRequestException('Le prix ne peut pas être négatif');
    }

    const listing = this.listingRepository.create({
      creatorId,
      title: dto.title,
      description: dto.description || null,
      listingType: dto.listing_type as ListingTypeEnum,
      priceCents: dto.price_cents ?? 0,
      categoryId: dto.category_id || null,
      neighbourhoodId: dto.neighbourhood_id || null,
      status: ListingStatusEnum.OPEN,
    });

    const savedListing = await this.listingRepository.save(listing);

    // Sync with Neo4j
    await this.neo4jSyncQueue.add('upsert-listing', {
      id: savedListing.id,
      title: savedListing.title,
      listing_type: savedListing.listingType,
      status: savedListing.status,
      neighbourhood_id: savedListing.neighbourhoodId,
      created_at: savedListing.createdAt,
    });

    if (savedListing.neighbourhoodId) {
      await this.neo4jSyncQueue.add('create-posted-in', {
        listingId: savedListing.id,
        neighbourhoodId: savedListing.neighbourhoodId,
      });
    }

    return savedListing;
  }

  async findOne(id: string): Promise<Listing> {
    const listing = await this.listingRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!listing) {
      throw new NotFoundException('Annonce introuvable');
    }
    return listing;
  }

  async update(userId: string, id: string, dto: UpdateListingDto): Promise<Listing> {
    const listing = await this.findOne(id);

    if (listing.creatorId !== userId) {
      throw new ForbiddenException('Action non autorisée');
    }

    if (listing.status !== ListingStatusEnum.OPEN) {
      throw new ConflictException('Modification impossible : l\'annonce n\'est plus ouverte');
    }

    if (dto.price_cents !== undefined && dto.price_cents < 0) {
      throw new BadRequestException('Le prix ne peut pas être négatif');
    }

    const oldNeighbourhoodId = listing.neighbourhoodId;

    if (dto.title !== undefined) {
      if (dto.title.trim() === '') {
        throw new BadRequestException('Le titre ne peut pas être vide');
      }
      listing.title = dto.title;
    }
    if (dto.description !== undefined) listing.description = dto.description;
    if (dto.category_id !== undefined) listing.categoryId = dto.category_id;
    if (dto.price_cents !== undefined) listing.priceCents = dto.price_cents;
    if (dto.neighbourhood_id !== undefined) listing.neighbourhoodId = dto.neighbourhood_id;

    listing.updatedAt = new Date();

    const savedListing = await this.listingRepository.save(listing);

    // Update Neo4j relation if neighbourhood changed
    if (dto.neighbourhood_id !== undefined && dto.neighbourhood_id !== oldNeighbourhoodId) {
      await this.neo4jSyncQueue.add('update-posted-in', {
        listingId: savedListing.id,
        neighbourhoodId: savedListing.neighbourhoodId,
      });
    }

    // Upsert listing status/properties in Neo4j
    await this.neo4jSyncQueue.add('upsert-listing', {
      id: savedListing.id,
      title: savedListing.title,
      listing_type: savedListing.listingType,
      status: savedListing.status,
      neighbourhood_id: savedListing.neighbourhoodId,
      created_at: savedListing.createdAt,
    });

    return savedListing;
  }

  async softDelete(userId: string, id: string, isModerator: boolean): Promise<void> {
    const listing = await this.findOne(id);

    if (listing.creatorId !== userId && !isModerator) {
      throw new ForbiddenException('Action non autorisée');
    }

    listing.deletedAt = new Date();
    await this.listingRepository.save(listing);

    // Sync detach delete in Neo4j
    await this.neo4jSyncQueue.add('delete-listing', { id: listing.id });
  }
}
