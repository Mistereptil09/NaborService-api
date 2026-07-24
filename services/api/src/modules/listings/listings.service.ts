import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Listing } from './entities/listing.entity';
import { ListingTransaction } from './entities/listing-transaction.entity';
import {
  CreateListingDto,
  UpdateListingDto,
  ListListingsDto,
} from './dto/listing-routes.dtos';
import { ListingStatusEnum, ListingTypeEnum } from '../../common/enums';
import { isModeratorOrAdmin } from '../../common/ownership';
import { UserBlock } from '../social/entities/user-block.entity';
import { MediaService } from '../media/services/media.service';

const CREATOR_SAFE_FIELDS = [
  'creator.id',
  'creator.firstName',
  'creator.lastName',
  'creator.profilePictureMongoId',
];

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(ListingTransaction)
    private readonly transactionRepository: Repository<ListingTransaction>,
    @InjectRepository(UserBlock)
    private readonly blockRepository: Repository<UserBlock>,
    private readonly mediaService: MediaService,
    @Inject('BullQueue_neo4j-sync')
    private readonly neo4jSyncQueue: {
      add: (name: string, data: any) => Promise<any>;
    },
  ) {}

  async list(
    userId: string,
    dto: ListListingsDto,
  ): Promise<{
    data: (Listing & { coverMediaId: string | null })[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const query = this.listingRepository
      .createQueryBuilder('listing')
      .leftJoin('listing.creator', 'creator')
      .addSelect(CREATOR_SAFE_FIELDS)
      .where('listing.deletedAt IS NULL');

    const blocks = await this.blockRepository.find({
      where: [{ blockerId: userId }, { blockedId: userId }],
    });
    const blockedUserIds = blocks.map((b) =>
      b.blockerId === userId ? b.blockedId : b.blockerId,
    );
    if (blockedUserIds.length > 0) {
      query.andWhere('listing.creatorId NOT IN (:...blockedUserIds)', {
        blockedUserIds,
      });
    }

    if (dto.neighbourhood) {
      query.andWhere('listing.neighbourhoodId = :neighbourhood', {
        neighbourhood: dto.neighbourhood,
      });
    }

    if (dto.category !== undefined) {
      query.andWhere('listing.categoryId = :category', {
        category: dto.category,
      });
    }

    if (dto.type) {
      query.andWhere('listing.listingType = :type', { type: dto.type });
    }

    if (dto.status && dto.status !== 'all') {
      query.andWhere('listing.status = :status', { status: dto.status });
    }

    query.orderBy('listing.createdAt', 'DESC').skip(dto.offset).take(dto.limit);

    const [data, total] = await query.getManyAndCount();

    const covers = await this.mediaService.findCoverImages(
      'listing_photo',
      data.map((l) => l.id),
    );
    const enriched = data.map((l) => ({
      ...l,
      coverMediaId: covers.get(l.id) ?? null,
    }));

    return {
      data: enriched,
      meta: { total, offset: dto.offset, limit: dto.limit },
    };
  }

  async findUserOperations(
    userId: string,
    dto: ListListingsDto,
  ): Promise<{
    data: (Listing & { coverMediaId: string | null })[];
    meta: { total: number; offset: number; limit: number };
  }> {
    const query = this.listingRepository
      .createQueryBuilder('listing')
      .leftJoin('listing.creator', 'creator')
      .addSelect(CREATOR_SAFE_FIELDS)
      .innerJoin(
        ListingTransaction,
        'transaction',
        'transaction.listingId = listing.id AND (transaction.providerId = :userId OR transaction.requesterId = :userId)',
        { userId },
      )
      .where('listing.deletedAt IS NULL');

    const blocks = await this.blockRepository.find({
      where: [{ blockerId: userId }, { blockedId: userId }],
    });
    const blockedUserIds = blocks.map((b) =>
      b.blockerId === userId ? b.blockedId : b.blockerId,
    );
    if (blockedUserIds.length > 0) {
      query.andWhere('listing.creatorId NOT IN (:...blockedUserIds)', {
        blockedUserIds,
      });
    }

    if (dto.status && dto.status !== 'all') {
      query.andWhere('listing.status = :status', { status: dto.status });
    }

    query.orderBy('listing.createdAt', 'DESC').skip(dto.offset).take(dto.limit);

    const [data, total] = await query.getManyAndCount();

    const covers = await this.mediaService.findCoverImages(
      'listing_photo',
      data.map((l) => l.id),
    );
    const enriched = data.map((l) => ({
      ...l,
      coverMediaId: covers.get(l.id) ?? null,
    }));

    return {
      data: enriched,
      meta: { total, offset: dto.offset, limit: dto.limit },
    };
  }

  async create(creatorId: string, dto: CreateListingDto): Promise<Listing> {
    if (!dto.title || dto.title.trim() === '') {
      throw new BadRequestException('Le titre est obligatoire');
    }
    if (
      dto.listing_type !== ListingTypeEnum.OFFER &&
      dto.listing_type !== ListingTypeEnum.REQUEST
    ) {
      throw new BadRequestException("Type d'annonce invalide");
    }
    if (dto.price_cents !== undefined && dto.price_cents < 0) {
      throw new BadRequestException('Le prix ne peut pas être négatif');
    }

    const listing = this.listingRepository.create({
      creatorId,
      title: dto.title,
      description: dto.description || null,
      listingType: dto.listing_type,
      priceCents: dto.price_cents ?? 0,
      categoryId: dto.category_id || null,
      neighbourhoodId: dto.neighbourhood_id || null,
      status: ListingStatusEnum.OPEN,
    });

    const savedListing = await this.listingRepository.save(listing);

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
    const listing = await this.listingRepository
      .createQueryBuilder('listing')
      .leftJoin('listing.creator', 'creator')
      .addSelect(CREATOR_SAFE_FIELDS)
      .where('listing.id = :id', { id })
      .andWhere('listing.deletedAt IS NULL')
      .getOne();
    if (!listing) {
      throw new NotFoundException('Annonce introuvable');
    }
    return listing;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateListingDto,
    userRole?: string,
  ): Promise<Listing> {
    const listing = await this.findOne(id);

    if (listing.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Action non autorisée');
    }

    if (listing.status !== ListingStatusEnum.OPEN) {
      throw new ConflictException(
        "Modification impossible : l'annonce n'est plus ouverte",
      );
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
    if (dto.neighbourhood_id !== undefined)
      listing.neighbourhoodId = dto.neighbourhood_id;

    listing.updatedAt = new Date();

    const savedListing = await this.listingRepository.save(listing);

    if (
      dto.neighbourhood_id !== undefined &&
      dto.neighbourhood_id !== oldNeighbourhoodId
    ) {
      await this.neo4jSyncQueue.add('update-posted-in', {
        listingId: savedListing.id,
        neighbourhoodId: savedListing.neighbourhoodId,
      });
    }

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

  async softDelete(
    userId: string,
    id: string,
    userRole?: string,
  ): Promise<void> {
    const listing = await this.findOne(id);

    if (listing.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
      throw new ForbiddenException('Action non autorisée');
    }

    listing.deletedAt = new Date();
    await this.listingRepository.save(listing);

    await this.neo4jSyncQueue.add('delete-listing', { id: listing.id });
  }
}
