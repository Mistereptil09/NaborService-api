import { NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Contract,
  ContractDocument,
} from '../../../database/mongo-schemas/schemas/contract.schema';
import { ListingTransaction } from '../entities/listing-transaction.entity';
import { Listing } from '../entities/listing.entity';
import {
  ListingStatusEnum,
  TransactionStatusEnum,
} from '../../../common/enums';
import { ListingsGateway } from '../listings.gateway';
import { ContractExpirationJobPayload } from '../../../queue/interfaces/job-payloads';
import { classifyAndThrow } from '../../../queue/utils/error-classifier';
import { getBackoffDelay } from '../../../queue/utils/backoff-strategy';

@Processor('contract-expiration', {
  concurrency: 1,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom'
        ? getBackoffDelay('contract-expiration', attemptsMade)
        : 1000;
    },
  },
})
export class ContractExpirationWorker extends WorkerHost {
  constructor(
    @InjectRepository(ListingTransaction)
    private readonly transactionRepository: Repository<ListingTransaction>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    private readonly listingsGateway: ListingsGateway,
    @InjectQueue('neo4j-sync')
    private readonly neo4jSyncQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ContractExpirationJobPayload>): Promise<any> {
    try {
      await this.processJob(job.data);
    } catch (error: any) {
      classifyAndThrow(error);
    }
  }

  async processJob(data: { transactionId: string }): Promise<void> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: data.transactionId },
    });
    if (!transaction) {
      throw new NotFoundException(
        `Transaction ${data.transactionId} non trouvée`,
      );
    }

    const listing = await this.listingRepository.findOne({
      where: { id: transaction.listingId },
    });
    if (!listing) {
      throw new NotFoundException(
        `Annonce pour la transaction ${data.transactionId} non trouvée`,
      );
    }

    if (
      listing.status !== ListingStatusEnum.IN_PROGRESS &&
      listing.status !== ListingStatusEnum.PENDING
    ) {
      return;
    }

    const contract = await this.contractModel.findOne({
      pg_transaction_id: transaction.id,
      type: 'contract',
    });

    if (!contract || contract.signed_at === null) {
      listing.status = ListingStatusEnum.CANCELLED;
      listing.updatedAt = new Date();
      await this.listingRepository.save(listing);

      transaction.status = TransactionStatusEnum.CANCELLED;
      transaction.cancelledAt = new Date();
      await this.transactionRepository.save(transaction);

      await this.neo4jSyncQueue.add('upsert-listing', {
        id: listing.id,
        title: listing.title,
        listing_type: listing.listingType,
        status: listing.status,
        neighbourhood_id: listing.neighbourhoodId,
        created_at: listing.createdAt,
      });

      this.listingsGateway.emitStatusChanged(
        listing.id,
        ListingStatusEnum.CANCELLED,
        listing.updatedAt,
      );
    }
  }
}
