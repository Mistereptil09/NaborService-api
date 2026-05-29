import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getModelToken } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { ContractExpirationWorker } from '../contract-expiration.worker';
import { ListingTransaction } from '../../entities/listing-transaction.entity';
import { Listing } from '../../entities/listing.entity';
import { Contract } from '../../../../database/mongo-schemas/schemas/contract.schema';
import { ListingsGateway } from '../../listings.gateway';
import { ListingStatusEnum, TransactionStatusEnum } from '../../../../common/enums';
import { UnrecoverableError } from 'bullmq';

describe('ContractExpirationWorker', () => {
  let worker: ContractExpirationWorker;
  const mockTransactionRepo = { findOne: jest.fn(), save: jest.fn() };
  const mockListingRepo = { findOne: jest.fn(), save: jest.fn() };
  const mockContractModel = { findOne: jest.fn() };
  const mockListingsGateway = { emitStatusChanged: jest.fn() };
  const mockNeo4jSyncQueue = { add: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractExpirationWorker,
        { provide: getRepositoryToken(ListingTransaction), useValue: mockTransactionRepo },
        { provide: getRepositoryToken(Listing), useValue: mockListingRepo },
        { provide: getModelToken(Contract.name), useValue: mockContractModel },
        { provide: ListingsGateway, useValue: mockListingsGateway },
        { provide: getQueueToken('neo4j-sync'), useValue: mockNeo4jSyncQueue },
      ],
    }).compile();

    worker = module.get<ContractExpirationWorker>(ContractExpirationWorker);
    jest.clearAllMocks();
  });

  it('should expire contract if not signed', async () => {
    mockTransactionRepo.findOne.mockResolvedValue({ id: 'tx-1', listingId: 'list-1' });
    mockListingRepo.findOne.mockResolvedValue({ 
      id: 'list-1', status: ListingStatusEnum.IN_PROGRESS, title: 'Test' 
    });
    mockContractModel.findOne.mockResolvedValue({ signed_at: null });

    const job = { data: { transactionId: 'tx-1' } } as Job;
    await worker.process(job);

    expect(mockListingRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ListingStatusEnum.CANCELLED }));
    expect(mockTransactionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: TransactionStatusEnum.CANCELLED }));
    expect(mockNeo4jSyncQueue.add).toHaveBeenCalledWith('upsert-listing', expect.any(Object));
    expect(mockListingsGateway.emitStatusChanged).toHaveBeenCalled();
  });

  it('should ignore if listing is already cancelled', async () => {
    mockTransactionRepo.findOne.mockResolvedValue({ id: 'tx-1', listingId: 'list-1' });
    mockListingRepo.findOne.mockResolvedValue({ status: ListingStatusEnum.CANCELLED });
    
    const job = { data: { transactionId: 'tx-1' } } as Job;
    await worker.process(job);

    expect(mockContractModel.findOne).not.toHaveBeenCalled();
  });

  it('should wrap NotFoundException in UnrecoverableError', async () => {
    mockTransactionRepo.findOne.mockResolvedValue(null);
    const job = { data: { transactionId: 'tx-2' } } as Job;
    
    await expect(worker.process(job)).rejects.toThrow(UnrecoverableError);
  });
});
