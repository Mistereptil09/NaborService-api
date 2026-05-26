import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contract, ContractDocument } from '../../../database/mongo-schemas/schemas/contract.schema';
import { ListingTransaction } from '../entities/listing-transaction.entity';
import { Listing } from '../entities/listing.entity';
import { ListingStatusEnum, TransactionStatusEnum } from '../../../common/enums';
import { ListingsGateway } from '../listings.gateway';

@Injectable()
export class ContractExpirationWorker {
  constructor(
    @InjectRepository(ListingTransaction)
    private readonly transactionRepository: Repository<ListingTransaction>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    private readonly listingsGateway: ListingsGateway,
    @Inject('BullQueue_neo4j-sync')
    private readonly neo4jSyncQueue: { add: (name: string, data: any) => Promise<any> },
  ) {}

  async processJob(data: { transactionId: string }): Promise<void> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: data.transactionId },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${data.transactionId} non trouvée`);
    }

    const listing = await this.listingRepository.findOne({
      where: { id: transaction.listingId },
    });
    if (!listing) {
      throw new NotFoundException(`Annonce pour la transaction ${data.transactionId} non trouvée`);
    }

    // Only cancel if listing is not already closed or cancelled
    if (listing.status !== ListingStatusEnum.IN_PROGRESS && listing.status !== ListingStatusEnum.PENDING) {
      return;
    }

    const contract = await this.contractModel.findOne({
      pg_transaction_id: transaction.id,
    });

    // If no contract found or it's not signed yet, expire it
    if (!contract || contract.signed_at === null) {
      listing.status = ListingStatusEnum.CANCELLED;
      listing.updatedAt = new Date();
      await this.listingRepository.save(listing);

      transaction.status = TransactionStatusEnum.CANCELLED;
      transaction.cancelledAt = new Date();
      await this.transactionRepository.save(transaction);

      // Sync Neo4j
      await this.neo4jSyncQueue.add('upsert-listing', {
        id: listing.id,
        title: listing.title,
        listing_type: listing.listingType,
        status: listing.status,
        neighbourhood_id: listing.neighbourhoodId,
        created_at: listing.createdAt,
      });

      // Emit Gateway Status Changed
      this.listingsGateway.emitStatusChanged(listing.id, ListingStatusEnum.CANCELLED, listing.updatedAt);
    }
  }
}
