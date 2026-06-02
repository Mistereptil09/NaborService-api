import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ListingModerationAction } from './entities/listing-moderation-action.entity';
import { Listing } from './entities/listing.entity';
import { ListingReport } from './entities/listing-report.entity';
import { ListingTransaction } from './entities/listing-transaction.entity';
import { ModerateListingDto, ListListingsDto } from './dto/listing-routes.dtos';
import {
  ListingStatusEnum,
  TransactionStatusEnum,
  ModerationActionEnum,
} from '../../common/enums';
import { ListingsService } from './listings.service';
import { ListingTransactionService } from './listing-transaction.service';

@Injectable()
export class ListingModerationService {
  constructor(
    @InjectRepository(ListingModerationAction)
    private readonly moderationRepository: Repository<ListingModerationAction>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(ListingReport)
    private readonly reportRepository: Repository<ListingReport>,
    @Inject(forwardRef(() => ListingsService))
    private readonly listingsService: ListingsService,
    private readonly transactionService: ListingTransactionService,
    @Inject('BullQueue_neo4j-sync')
    private readonly neo4jSyncQueue: {
      add: (name: string, data: any) => Promise<any>;
    },
    @Inject('BullQueue_email')
    private readonly emailQueue: {
      add: (name: string, data: any) => Promise<any>;
    },
  ) {}

  async moderate(
    moderatorId: string,
    listingId: string,
    dto: ModerateListingDto,
  ): Promise<void> {
    if (
      !dto.action ||
      !['cancelled', 'warned', 'restored'].includes(dto.action)
    ) {
      throw new BadRequestException('Action de modération invalide');
    }
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('Le motif est obligatoire');
    }

    const listing = await this.listingsService.findOne(listingId);

    // 1. Create ListingModerationAction
    const modAction = this.moderationRepository.create({
      listingId,
      moderatorId,
      action: dto.action as ModerationActionEnum,
      reason: dto.reason,
      createdAt: new Date(),
    });
    await this.moderationRepository.save(modAction);

    // 2. Resolve all unresolved reports
    await this.reportRepository.update(
      { listingId, resolvedAt: IsNull() },
      { resolvedAt: new Date() },
    );

    // 3. Apply action effects
    const oldStatus = listing.status;
    if (dto.action === 'cancelled') {
      listing.status = ListingStatusEnum.CANCELLED;

      if (oldStatus === ListingStatusEnum.IN_PROGRESS) {
        try {
          const transaction =
            await this.transactionService.findByListingId(listingId);
          transaction.status = TransactionStatusEnum.CANCELLED;
          transaction.cancelledAt = new Date();
          await this.transactionService.save(transaction);
        } catch {
          // No active transaction found, ignore
        }
      }
    } else if (dto.action === 'restored') {
      listing.status = ListingStatusEnum.OPEN;
    }
    // 'warned' does not change listing status

    listing.updatedAt = new Date();
    await this.listingRepository.save(listing);

    // 4. Sync Neo4j
    await this.neo4jSyncQueue.add('upsert-listing', {
      id: listing.id,
      title: listing.title,
      listing_type: listing.listingType,
      status: listing.status,
      neighbourhood_id: listing.neighbourhoodId,
      created_at: listing.createdAt,
    });

    // 5. Send notification email to creator
    await this.emailQueue.add('moderation-notification', {
      creatorId: listing.creatorId,
      listingId: listing.id,
      action: dto.action,
      reason: dto.reason,
    });
  }

  async getModerationHistory(
    listingId: string,
  ): Promise<ListingModerationAction[]> {
    await this.listingsService.findOne(listingId); // verify listing exists

    return this.moderationRepository.find({
      where: { listingId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAllModerationActions(
    dto: ListListingsDto,
  ): Promise<{ data: ListingModerationAction[]; total: number }> {
    const [data, total] = await this.moderationRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: dto.offset,
      take: dto.limit,
    });
    return { data, total };
  }
}
