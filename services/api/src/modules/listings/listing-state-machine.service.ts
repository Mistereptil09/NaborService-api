import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull } from 'typeorm';
import { Listing } from './entities/listing.entity';
import { ListingTransaction } from './entities/listing-transaction.entity';
import { ListingsService } from './listings.service';
import { ListingTransactionService } from './listing-transaction.service';
import { ListingsGateway } from './listings.gateway';
import {
  ListingStatusEnum,
  TransactionStatusEnum,
  PointsLedgerEntryTypeEnum,
} from '../../common/enums';
import { isModeratorOrAdmin } from '../../common/ownership';
import { AdminConfigService } from '../admin/admin-config.service';
import { NotificationsService } from '../messaging/notifications.service';
import { PointsService } from '../points/points.service';

@Injectable()
export class ListingStateMachineService {
  private readonly logger = new Logger(ListingStateMachineService.name);

  constructor(
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @Inject(forwardRef(() => ListingsService))
    private readonly listingsService: ListingsService,
    private readonly transactionService: ListingTransactionService,
    private readonly listingsGateway: ListingsGateway,
    @Inject('BullQueue_neo4j-sync')
    private readonly neo4jSyncQueue: {
      add: (name: string, data: any) => Promise<any>;
    },
    @Inject('BullQueue_pdf-generation')
    private readonly pdfGenerationQueue: {
      add: (name: string, data: any) => Promise<any>;
    },
    @Inject('BullQueue_contract-expiration')
    private readonly contractExpirationQueue: {
      add: (name: string, data: any, options?: any) => Promise<any>;
    },
    private readonly configService: AdminConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly pointsService: PointsService,
    private readonly dataSource: DataSource,
  ) {}

  async expressInterest(
    listingId: string,
    requesterId: string,
  ): Promise<{ listing: Listing; transaction: ListingTransaction }> {
    const listing = await this.listingsService.findOne(listingId);

    if (listing.creatorId === requesterId) {
      throw new ForbiddenException(
        "Le créateur ne peut pas exprimer d'intérêt sur sa propre annonce",
      );
    }

    if (listing.status !== ListingStatusEnum.OPEN) {
      throw new ConflictException("L'annonce n'est plus ouverte");
    }

    const existingTransaction =
      await this.transactionService.findOneByListingId(listingId);
    if (existingTransaction) {
      throw new ConflictException(
        'Une transaction existe déjà pour cette annonce',
      );
    }

    let commissionPercent = 5;
    try {
      const config = await this.configService.getConfig();
      commissionPercent = config.commissionPercent;
    } catch (e) {
      // Fallback
    }

    const commissionPoints = Math.round(
      (listing.priceCents * commissionPercent) / 100,
    );

    const transaction = await this.transactionService.create(
      listingId,
      listing.creatorId,
      requesterId,
      listing.priceCents,
      commissionPoints,
    );

    const result = await this.listingRepository.update(
      { id: listingId, status: ListingStatusEnum.OPEN },
      { status: ListingStatusEnum.PENDING, updatedAt: new Date() },
    );

    if (result.affected === 0) {
      throw new ConflictException("L'annonce n'est plus ouverte");
    }

    const updatedListing = await this.listingsService.findOne(listingId);

    await this.neo4jSyncQueue.add('upsert-listing', {
      id: updatedListing.id,
      title: updatedListing.title,
      listing_type: updatedListing.listingType,
      status: updatedListing.status,
      neighbourhood_id: updatedListing.neighbourhoodId,
      created_at: updatedListing.createdAt,
    });

    this.listingsGateway.joinPartiesToRoom(
      listingId,
      listing.creatorId,
      requesterId,
    );
    this.listingsGateway.emitStatusChanged(
      listingId,
      ListingStatusEnum.PENDING,
      updatedListing.updatedAt || new Date(),
    );

    try {
      await this.notificationsService.create({
        userId: listing.creatorId,
        type: 'new_listing_interest',
        payload: {
          listingTitle: updatedListing.title,
          listingId,
          transactionId: transaction.id,
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `new_listing_interest notification failed for ${listing.creatorId}: ${error?.message ?? error}`,
      );
    }

    return { listing: updatedListing, transaction };
  }

  async acceptInterest(listingId: string, creatorId: string): Promise<Listing> {
    const listing = await this.listingsService.findOne(listingId);

    if (listing.creatorId !== creatorId) {
      throw new ForbiddenException('Action non autorisée');
    }

    if (listing.status !== ListingStatusEnum.PENDING) {
      throw new ConflictException(
        "L'annonce n'est pas en attente d'acceptation",
      );
    }

    const result = await this.listingRepository.update(
      { id: listingId, status: ListingStatusEnum.PENDING },
      { status: ListingStatusEnum.IN_PROGRESS, updatedAt: new Date() },
    );

    if (result.affected === 0) {
      throw new ConflictException(
        "L'annonce n'est plus en attente d'acceptation",
      );
    }

    const updatedListing = await this.listingsService.findOne(listingId);
    const transaction =
      await this.transactionService.findByListingId(listingId);

    await this.pdfGenerationQueue.add('generate-contract', {
      transactionId: transaction.id,
    });

    let contractExpirationHours = 24;
    try {
      const config = await this.configService.getConfig();
      contractExpirationHours = config.contractExpirationHours;
    } catch (e) {
      // Fallback
    }

    await this.contractExpirationQueue.add(
      'expire-unsigned-contract',
      { transactionId: transaction.id },
      { delay: contractExpirationHours * 60 * 60 * 1000 },
    );

    await this.neo4jSyncQueue.add('upsert-listing', {
      id: updatedListing.id,
      title: updatedListing.title,
      listing_type: updatedListing.listingType,
      status: updatedListing.status,
      neighbourhood_id: updatedListing.neighbourhoodId,
      created_at: updatedListing.createdAt,
    });

    this.listingsGateway.emitStatusChanged(
      listingId,
      ListingStatusEnum.IN_PROGRESS,
      updatedListing.updatedAt || new Date(),
    );

    try {
      await this.notificationsService.create({
        userId: transaction.requesterId,
        type: 'listing_accepted',
        payload: {
          listingTitle: updatedListing.title,
          listingId,
          transactionId: transaction.id,
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `listing_accepted notification failed for ${transaction.requesterId}: ${error?.message ?? error}`,
      );
    }

    return updatedListing;
  }

  async pay(
    listingId: string,
    requesterId: string,
  ): Promise<ListingTransaction> {
    const transaction =
      await this.transactionService.findByListingId(listingId);

    if (transaction.requesterId !== requesterId) {
      throw new ForbiddenException('Action non autorisée');
    }

    if (
      transaction.listing.status !== ListingStatusEnum.IN_PROGRESS ||
      transaction.status !== TransactionStatusEnum.PENDING ||
      transaction.paidAt
    ) {
      throw new ConflictException('Cette transaction ne peut pas être payée');
    }

    return this.dataSource.transaction(async (manager) => {
      await this.pointsService.debit(
        {
          userId: requesterId,
          amountPoints: transaction.amountPoints,
          type: PointsLedgerEntryTypeEnum.LISTING_HOLD,
          referenceType: 'listing_transaction',
          referenceId: transaction.id,
        },
        manager,
      );

      transaction.paidAt = new Date();
      return manager.save(transaction);
    });
  }

  async confirmExecution(
    listingId: string,
    userId: string,
  ): Promise<ListingTransaction> {
    const transaction =
      await this.transactionService.findByListingId(listingId);
    await this.transactionService.verifyPartyAccess(userId, transaction);

    const listing = await this.listingsService.findOne(listingId);
    if (listing.status !== ListingStatusEnum.IN_PROGRESS) {
      throw new ConflictException("L'annonce n'est pas en cours");
    }

    if (transaction.providerId === userId) {
      if (transaction.providerConfirmedAt) {
        throw new ConflictException('Confirmation déjà enregistrée');
      }
      transaction.providerConfirmedAt = new Date();
    } else {
      if (transaction.requesterConfirmedAt) {
        throw new ConflictException('Confirmation déjà enregistrée');
      }
      transaction.requesterConfirmedAt = new Date();
    }

    let savedTransaction = await this.transactionService.save(transaction);

    if (
      savedTransaction.providerConfirmedAt &&
      savedTransaction.requesterConfirmedAt
    ) {
      savedTransaction = await this.dataSource.transaction(async (manager) => {
        const result = await manager.update(
          Listing,
          { id: listingId, status: ListingStatusEnum.IN_PROGRESS },
          {
            status: ListingStatusEnum.CLOSED,
            closedAt: new Date(),
            updatedAt: new Date(),
          },
        );

        if (result.affected === 0) {
          throw new ConflictException("L'annonce n'est plus en cours");
        }

        savedTransaction.status = TransactionStatusEnum.COMPLETED;
        savedTransaction.completedAt = new Date();
        const completed = await manager.save(savedTransaction);

        const payoutPoints =
          completed.amountPoints - completed.commissionPoints;
        if (payoutPoints > 0) {
          await this.pointsService.credit(
            {
              userId: completed.providerId,
              amountPoints: payoutPoints,
              type: PointsLedgerEntryTypeEnum.LISTING_PAYOUT,
              referenceType: 'listing_transaction',
              referenceId: completed.id,
            },
            manager,
          );
        }
        if (completed.commissionPoints > 0) {
          await this.pointsService.recordCommission(
            {
              amountPoints: completed.commissionPoints,
              type: PointsLedgerEntryTypeEnum.LISTING_COMMISSION,
              referenceType: 'listing_transaction',
              referenceId: completed.id,
            },
            manager,
          );
        }

        return completed;
      });

      const updatedListing = await this.listingsService.findOne(listingId);

      await this.pdfGenerationQueue.add('generate-receipt', {
        transactionId: savedTransaction.id,
      });

      await this.neo4jSyncQueue.add('upsert-listing', {
        id: updatedListing.id,
        title: updatedListing.title,
        listing_type: updatedListing.listingType,
        status: updatedListing.status,
        neighbourhood_id: updatedListing.neighbourhoodId,
        created_at: updatedListing.createdAt,
      });

      this.listingsGateway.emitStatusChanged(
        listingId,
        ListingStatusEnum.CLOSED,
        updatedListing.updatedAt || new Date(),
      );
    }

    return savedTransaction;
  }

  async cancel(
    listingId: string,
    userId: string,
    reason: string,
    userRole?: string,
  ): Promise<Listing> {
    if (!reason || reason.trim() === '') {
      throw new BadRequestException("Le motif d'annulation est obligatoire");
    }

    const listing = await this.listingsService.findOne(listingId);

    if (listing.status === ListingStatusEnum.CLOSED) {
      throw new ConflictException("Impossible d'annuler une annonce clôturée");
    }

    let transaction: ListingTransaction | null = null;
    try {
      transaction = await this.transactionService.findByListingId(listingId);
    } catch {
      // Transaction might not exist if cancelled from OPEN
    }

    if (listing.status === ListingStatusEnum.OPEN) {
      if (listing.creatorId !== userId && !isModeratorOrAdmin(userRole)) {
        throw new ForbiddenException('Action non autorisée');
      }
    } else if (transaction) {
      if (
        transaction.providerId !== userId &&
        transaction.requesterId !== userId
      ) {
        throw new ForbiddenException('Action non autorisée');
      }
    } else {
      throw new ForbiddenException('Action non autorisée');
    }

    await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        Listing,
        { id: listingId, status: listing.status },
        { status: ListingStatusEnum.CANCELLED, updatedAt: new Date() },
      );

      if (result.affected === 0) {
        throw new ConflictException('Action impossible');
      }

      if (transaction) {
        transaction.status = TransactionStatusEnum.CANCELLED;
        transaction.cancelledAt = new Date();
        await manager.save(transaction);

        if (transaction.paidAt) {
          await this.pointsService.credit(
            {
              userId: transaction.requesterId,
              amountPoints: transaction.amountPoints,
              type: PointsLedgerEntryTypeEnum.LISTING_REFUND,
              referenceType: 'listing_transaction',
              referenceId: transaction.id,
            },
            manager,
          );
        }
      }
    });

    const updatedListing = await this.listingsService.findOne(listingId);

    await this.neo4jSyncQueue.add('upsert-listing', {
      id: updatedListing.id,
      title: updatedListing.title,
      listing_type: updatedListing.listingType,
      status: updatedListing.status,
      neighbourhood_id: updatedListing.neighbourhoodId,
      created_at: updatedListing.createdAt,
    });

    this.listingsGateway.emitStatusChanged(
      listingId,
      ListingStatusEnum.CANCELLED,
      updatedListing.updatedAt || new Date(),
    );

    return updatedListing;
  }
}
