import { NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Contract, ContractDocument } from '../../../database/mongo-schemas/schemas/contract.schema';
import { ListingTransaction } from '../entities/listing-transaction.entity';
import { Listing } from '../entities/listing.entity';
import { PdfGenerationJobPayload } from '../../../queue/interfaces/job-payloads';
import { classifyAndThrow } from '../../../queue/utils/error-classifier';
import { getBackoffDelay } from '../../../queue/utils/backoff-strategy';

@Processor('pdf-generation', {
  concurrency: 1,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom' ? getBackoffDelay('pdf-generation', attemptsMade) : 1000;
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

  async processJob(jobName: string, data: { transactionId: string }): Promise<any> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: data.transactionId },
      relations: ['provider', 'requester'],
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

    const providerName = `${transaction.provider.firstName} ${transaction.provider.lastName}`;
    const requesterName = `${transaction.requester.firstName} ${transaction.requester.lastName}`;

    let pdfContent = '';
    let type: 'contract' | 'receipt';

    if (jobName === 'generate-contract') {
      type = 'contract';
      pdfContent = `%PDF-1.4
%---
CONTRAT DE PROMESSE DE SERVICE
Parties:
- Prestataire: ${providerName} (${transaction.provider.email})
- Demandeur: ${requesterName} (${transaction.requester.email})
Service: ${listing.title}
Montant: ${listing.priceCents} cents
Date: ${new Date().toISOString()}
Signatures:
______________________   ______________________
Prestataire             Demandeur`;
    } else if (jobName === 'generate-receipt') {
      type = 'receipt';
      pdfContent = `%PDF-1.4
%---
RECU DE BONNE EXECUTION
Reference Contrat: ${transaction.contractMongoId || 'N/A'}
Parties:
- Prestataire: ${providerName} (${transaction.provider.email})
- Demandeur: ${requesterName} (${transaction.requester.email})
Montant Regle: ${listing.priceCents} cents
Date de cloture: ${new Date().toISOString()}
Signatures:
______________________   ______________________
Prestataire             Demandeur`;
    } else {
      throw new Error(`Type de job ${jobName} inconnu`);
    }

    const pdfBuffer = Buffer.from(pdfContent, 'utf8');
    const sha256Hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Store in MongoDB Contracts collection
    const contract = new this.contractModel({
      pg_transaction_id: transaction.id,
      type,
      sha256_hash: sha256Hash,
      pdf: {
        data: pdfBuffer,
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

    // Update transaction references in PostgreSQL
    if (type === 'contract') {
      transaction.contractMongoId = savedContract._id.toString();
    } else {
      transaction.receiptMongoId = savedContract._id.toString();
    }

    await this.transactionRepository.save(transaction);
    return savedContract;
  }
}
