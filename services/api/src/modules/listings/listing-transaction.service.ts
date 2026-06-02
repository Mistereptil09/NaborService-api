import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListingTransaction } from './entities/listing-transaction.entity';
import { TransactionStatusEnum } from '../../common/enums';

@Injectable()
export class ListingTransactionService {
  constructor(
    @InjectRepository(ListingTransaction)
    private readonly transactionRepository: Repository<ListingTransaction>,
  ) {}

  async create(
    listingId: string,
    providerId: string,
    requesterId: string,
    amountCents: number = 0,
    commissionCents: number = 0,
  ): Promise<ListingTransaction> {
    if (providerId === requesterId) {
      throw new BadRequestException(
        "Le créateur ne peut pas exprimer d'intérêt sur sa propre annonce",
      );
    }

    const transaction = this.transactionRepository.create({
      listingId,
      providerId,
      requesterId,
      amountCents,
      commissionCents,
      status: TransactionStatusEnum.PENDING,
    });

    return this.transactionRepository.save(transaction);
  }

  async findByListingId(listingId: string): Promise<ListingTransaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { listingId },
      relations: ['provider', 'requester', 'listing'],
    });
    if (!transaction) {
      throw new NotFoundException('Transaction introuvable pour cette annonce');
    }
    return transaction;
  }

  async findOneByListingId(
    listingId: string,
  ): Promise<ListingTransaction | null> {
    return this.transactionRepository.findOne({
      where: { listingId },
    });
  }

  async findById(id: string): Promise<ListingTransaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['provider', 'requester', 'listing'],
    });
    if (!transaction) {
      throw new NotFoundException('Transaction introuvable');
    }
    return transaction;
  }

  async verifyPartyAccess(
    userId: string,
    transaction: ListingTransaction,
  ): Promise<void> {
    if (
      transaction.providerId !== userId &&
      transaction.requesterId !== userId
    ) {
      throw new ForbiddenException('Action non autorisée');
    }
  }

  async save(transaction: ListingTransaction): Promise<ListingTransaction> {
    return this.transactionRepository.save(transaction);
  }
}
