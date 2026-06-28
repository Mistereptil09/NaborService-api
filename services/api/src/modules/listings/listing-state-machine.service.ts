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
import { Repository, IsNull } from 'typeorm';
import { Listing } from './entities/listing.entity';
import { ListingTransaction } from './entities/listing-transaction.entity';
import { ListingsService } from './listings.service';
import { ListingTransactionService } from './listing-transaction.service';
import { ListingsGateway } from './listings.gateway';
import { ListingStatusEnum, TransactionStatusEnum } from '../../common/enums';
import { AdminConfigService } from '../admin/admin-config.service';
import { NotificationsService } from '../messaging/notifications.service';

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

    // Fetch config for commission percentage
    let commissionPercent = 5;
    try {
      const config = await this.configService.getConfig();
      commissionPercent = config.commissionPercent;
    } catch (e) {
      // Fallback
    }

    const commissionCents = Math.round(
      (listing.priceCents * commissionPercent) / 100,
    );

    // Create transaction
    const transaction = await this.transactionService.create(
      listingId,
      listing.creatorId,
      requesterId,
      listing.priceCents,
      commissionCents,
    );

    // Update listing status
    const result = await this.listingRepository.update(
      { id: listingId, status: ListingStatusEnum.OPEN },
      { status: ListingStatusEnum.PENDING, updatedAt: new Date() },
    );

    if (result.affected === 0) {
      throw new ConflictException("L'annonce n'est plus ouverte");
    }

    const updatedListing = await this.listingsService.findOne(listingId);

    // Neo4j Sync
    await this.neo4jSyncQueue.add('upsert-listing', {
      id: updatedListing.id,
      title: updatedListing.title,
      listing_type: updatedListing.listingType,
      status: updatedListing.status,
      neighbourhood_id: updatedListing.neighbourhoodId,
      created_at: updatedListing.createdAt,
    });

    // Gateway Room and Status change
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

    // Notify the listing creator that someone is interested (transactional).
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

    // Enqueue PDF contract generation
    await this.pdfGenerationQueue.add('generate-contract', {
      transactionId: transaction.id,
    });

    // Fetch config for contract expiration delay
    let contractExpirationHours = 24;
    try {
      const config = await this.configService.getConfig();
      contractExpirationHours = config.contractExpirationHours;
    } catch (e) {
      // Fallback
    }

    // Enqueue delayed expiration job (24h default)
    await this.contractExpirationQueue.add(
      'expire-unsigned-contract',
      { transactionId: transaction.id },
      { delay: contractExpirationHours * 60 * 60 * 1000 },
    );

    // Neo4j Sync
    await this.neo4jSyncQueue.add('upsert-listing', {
      id: updatedListing.id,
      title: updatedListing.title,
      listing_type: updatedListing.listingType,
      status: updatedListing.status,
      neighbourhood_id: updatedListing.neighbourhoodId,
      created_at: updatedListing.createdAt,
    });

    // Gateway status change
    this.listingsGateway.emitStatusChanged(
      listingId,
      ListingStatusEnum.IN_PROGRESS,
      updatedListing.updatedAt || new Date(),
    );

    // Notify the interested party that their request was accepted (transactional).
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

    // If both confirmed, close listing
    if (
      savedTransaction.providerConfirmedAt &&
      savedTransaction.requesterConfirmedAt
    ) {
      const result = await this.listingRepository.update(
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
      savedTransaction = await this.transactionService.save(savedTransaction);

      const updatedListing = await this.listingsService.findOne(listingId);

      // PDF Receipt generation
      await this.pdfGenerationQueue.add('generate-receipt', {
        transactionId: savedTransaction.id,
      });

      // Neo4j Sync
      await this.neo4jSyncQueue.add('upsert-listing', {
        id: updatedListing.id,
        title: updatedListing.title,
        listing_type: updatedListing.listingType,
        status: updatedListing.status,
        neighbourhood_id: updatedListing.neighbourhoodId,
        created_at: updatedListing.createdAt,
      });

      // Emit gateway
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

    // Party guard
    if (listing.status === ListingStatusEnum.OPEN) {
      if (listing.creatorId !== userId) {
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

    const result = await this.listingRepository.update(
      { id: listingId, status: listing.status },
      { status: ListingStatusEnum.CANCELLED, updatedAt: new Date() },
    );

    if (result.affected === 0) {
      throw new ConflictException('Action impossible');
    }

    const updatedListing = await this.listingsService.findOne(listingId);

    if (transaction) {
      transaction.status = TransactionStatusEnum.CANCELLED;
      transaction.cancelledAt = new Date();
      await this.transactionService.save(transaction);
    }

    // Neo4j Sync
    await this.neo4jSyncQueue.add('upsert-listing', {
      id: updatedListing.id,
      title: updatedListing.title,
      listing_type: updatedListing.listingType,
      status: updatedListing.status,
      neighbourhood_id: updatedListing.neighbourhoodId,
      created_at: updatedListing.createdAt,
    });

    // Gateway
    this.listingsGateway.emitStatusChanged(
      listingId,
      ListingStatusEnum.CANCELLED,
      updatedListing.updatedAt || new Date(),
    );

    return updatedListing;
  }
}
