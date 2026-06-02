import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getModelToken } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { PdfGenerationWorker } from '../pdf-generation.worker';
import { ListingTransaction } from '../../entities/listing-transaction.entity';
import { Listing } from '../../entities/listing.entity';
import { Contract } from '../../../../database/mongo-schemas/schemas/contract.schema';
import { UnrecoverableError } from 'bullmq';

describe('PdfGenerationWorker', () => {
  let worker: PdfGenerationWorker;
  const mockTransactionRepo = { findOne: jest.fn(), save: jest.fn() };
  const mockListingRepo = { findOne: jest.fn() };
  const mockContractModel = jest.fn().mockImplementation((data) => ({
    ...data,
    save: jest.fn().mockResolvedValue({ _id: 'mongo-id-123', ...data }),
  }));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfGenerationWorker,
        {
          provide: getRepositoryToken(ListingTransaction),
          useValue: mockTransactionRepo,
        },
        { provide: getRepositoryToken(Listing), useValue: mockListingRepo },
        { provide: getModelToken(Contract.name), useValue: mockContractModel },
      ],
    }).compile();

    worker = module.get<PdfGenerationWorker>(PdfGenerationWorker);
    jest.clearAllMocks();
  });

  it('should process generate-contract job', async () => {
    mockTransactionRepo.findOne.mockResolvedValue({
      id: 'tx-1',
      listingId: 'list-1',
      provider: { firstName: 'John', lastName: 'Doe', email: 'j@example.com' },
      requester: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
    });
    mockListingRepo.findOne.mockResolvedValue({
      title: 'Test Service',
      priceCents: 1000,
    });

    const job = {
      name: 'generate-contract',
      data: { transactionId: 'tx-1' },
    } as Job;
    await worker.process(job);

    expect(mockTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ contractMongoId: 'mongo-id-123' }),
    );
  });

  it('should process generate-receipt job', async () => {
    mockTransactionRepo.findOne.mockResolvedValue({
      id: 'tx-1',
      listingId: 'list-1',
      provider: { firstName: 'John', lastName: 'Doe', email: 'j@example.com' },
      requester: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
    });
    mockListingRepo.findOne.mockResolvedValue({
      title: 'Test Service',
      priceCents: 1000,
    });

    const job = {
      name: 'generate-receipt',
      data: { transactionId: 'tx-1' },
    } as Job;
    await worker.process(job);

    expect(mockTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ receiptMongoId: 'mongo-id-123' }),
    );
  });

  it('should wrap NotFoundException in UnrecoverableError', async () => {
    mockTransactionRepo.findOne.mockResolvedValue(null);
    const job = {
      name: 'generate-contract',
      data: { transactionId: 'tx-2' },
    } as Job;

    await expect(worker.process(job)).rejects.toThrow(UnrecoverableError);
  });
});
