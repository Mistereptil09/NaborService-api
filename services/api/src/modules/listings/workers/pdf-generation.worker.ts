import { NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  Contract,
  ContractDocument,
} from '../../../database/mongo-schemas/schemas/contract.schema';
import { MediaFile, MediaFileDocument } from '../../media/schemas/media-file.schema';
import { ListingTransaction } from '../entities/listing-transaction.entity';
import { Listing } from '../entities/listing.entity';
import { PdfGenerationJobPayload } from '../../../queue/interfaces/job-payloads';
import { classifyAndThrow } from '../../../queue/utils/error-classifier';
import { getBackoffDelay } from '../../../queue/utils/backoff-strategy';
import { GridFSService } from '../../media/services/gridfs.service';
import {
  generateContractPdf,
  generateReceiptPdf,
} from '../../../common/pdf-generator';

@Processor('pdf-generation', {
  concurrency: 1,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom'
        ? getBackoffDelay('pdf-generation', attemptsMade)
        : 1000;
    },
  },
})
export class PdfGenerationWorker extends WorkerHost {
  constructor(
    @InjectRepository(ListingTransaction)
    private readonly transactionRepository: Repository<ListingTransaction>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(MediaFile.name)
    private readonly mediaFileModel: Model<MediaFileDocument>,
    private readonly gridfsService: GridFSService,
  ) {
    super();
  }

  async process(job: Job<PdfGenerationJobPayload>): Promise<any> {
    try {
      return await this.processJob(job.name, job.data);
    } catch (error: any) {
      classifyAndThrow(error);
    }
  }

  async processJob(
    jobName: string,
    data: { transactionId: string },
  ): Promise<any> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: data.transactionId },
      relations: ['provider', 'requester'],
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

    const providerName = `${transaction.provider.firstName} ${transaction.provider.lastName}`;
    const requesterName = `${transaction.requester.firstName} ${transaction.requester.lastName}`;
    const date = new Date().toISOString();

    let pdfBuffer: Buffer;
    let type: 'contract' | 'receipt';

    if (jobName === 'generate-contract') {
      type = 'contract';
      pdfBuffer = generateContractPdf({
        title: listing.title,
        providerName,
        providerEmail: transaction.provider.email,
        requesterName,
        requesterEmail: transaction.requester.email,
        priceCents: listing.priceCents,
        date,
      });
    } else if (jobName === 'generate-receipt') {
      type = 'receipt';
      pdfBuffer = generateReceiptPdf({
        title: listing.title,
        providerName,
        providerEmail: transaction.provider.email,
        requesterName,
        requesterEmail: transaction.requester.email,
        priceCents: listing.priceCents,
        date,
        contractRef: transaction.contractMongoId || 'N/A',
      });
    } else {
      throw new Error(`Type de job ${jobName} inconnu`);
    }

    // 1. Upload PDF to GridFS
    const filename = `${type}_${transaction.id}.pdf`;
    const gridfsFileId = await this.gridfsService.upload(
      pdfBuffer,
      filename,
      'application/pdf',
    );

    const sha256Hash = crypto
      .createHash('sha256')
      .update(pdfBuffer)
      .digest('hex');

    // 2. Create media_file metadata document for retrieval
    const mediaDoc = new this.mediaFileModel({
      owner_type: 'contract',
      owner_id: transaction.id,
      gridfs_file_id: gridfsFileId,
      mimetype: 'application/pdf',
      size_bytes: pdfBuffer.length,
      original_filename: filename,
      sha256_hash: sha256Hash,
      contract_type: type,
      uploaded_at: new Date(),
    });
    await mediaDoc.save();

    // 3. Store contract metadata in MongoDB contracts collection
    const contract = new this.contractModel({
      pg_transaction_id: transaction.id,
      type,
      sha256_hash: sha256Hash,
      pdf: {
        gridfs_file_id: gridfsFileId,
        mimetype: 'application/pdf',
        size_bytes: pdfBuffer.length,
      },
      parties: {
        provider: {
          pg_user_id: transaction.providerId,
          full_name: providerName,
          email: transaction.provider.email,
        },
        requester: {
          pg_user_id: transaction.requesterId,
          full_name: requesterName,
          email: transaction.requester.email,
        },
      },
      listing_snapshot: {
        title: listing.title,
        price_cents: listing.priceCents,
        listing_type: listing.listingType,
        neighbourhood_name: listing.neighbourhoodId || 'Quartier General',
      },
      signature: {
        canvas_b64: null,
        totp_verified_at: new Date(),
        signed_ip: null,
        user_agent: null,
      },
      signed_at: null,
      created_at: new Date(),
    });

    const savedContract = await contract.save();

    // 4. Update transaction references in PostgreSQL
    if (type === 'contract') {
      transaction.contractMongoId = savedContract._id.toString();
    } else {
      transaction.receiptMongoId = savedContract._id.toString();
    }

    await this.transactionRepository.save(transaction);
    return savedContract;
  }
}
