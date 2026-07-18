import { Logger, NotFoundException } from '@nestjs/common';
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
import {
  MediaFile,
  MediaFileDocument,
} from '../../media/schemas/media-file.schema';
import { ListingTransaction } from '../entities/listing-transaction.entity';
import { Listing } from '../entities/listing.entity';
import { ListingCategory } from '../entities/listing-category.entity';
import { PdfGenerationJobPayload } from '../../../queue/interfaces/job-payloads';
import { classifyAndThrow } from '../../../queue/utils/error-classifier';
import { getBackoffDelay } from '../../../queue/utils/backoff-strategy';
import { GridFSService } from '../../media/services/gridfs.service';
import { DocumentTemplateService } from '../../documents/document-template.service';
import { NotificationsService } from '../../messaging/notifications.service';

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
    @InjectRepository(ListingCategory)
    private readonly categoryRepository: Repository<ListingCategory>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(MediaFile.name)
    private readonly mediaFileModel: Model<MediaFileDocument>,
    private readonly gridfsService: GridFSService,
    private readonly templateService: DocumentTemplateService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  private readonly logger = new Logger(PdfGenerationWorker.name);

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
    if (jobName === 'finalize-signed-contract') {
      return this.finalizeSignedContract(data.transactionId);
    }

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

    // Clauses par type de service : première catégorie connue en remontant
    // la chaîne des parents, sinon clauses génériques.
    const categoryChain = await this.getCategoryChain(listing.categoryId);
    const templateKey = this.templateService.resolveTemplateKey(categoryChain);
    const categoryName = categoryChain[0] ?? null;

    let pdfBuffer: Buffer;
    let type: 'contract' | 'receipt';

    const baseData = {
      title: listing.title,
      providerName,
      providerEmail: transaction.provider.email,
      requesterName,
      requesterEmail: transaction.requester.email,
      priceCents: listing.priceCents,
      date,
      templateKey,
      categoryName,
      neighbourhoodName: listing.neighbourhoodId || 'Quartier General',
    };

    if (jobName === 'generate-contract') {
      type = 'contract';
      pdfBuffer = await this.templateService.renderContract(baseData);
    } else if (jobName === 'generate-receipt') {
      type = 'receipt';
      pdfBuffer = await this.templateService.renderReceipt({
        ...baseData,
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
        category_name: categoryName,
        template_key: templateKey,
      },
      signatures: { provider: null, requester: null },
      signed_pdf: null,
      signed_pdf_sha256: null,
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

    // Once the contract is generated, notify both parties that a signature is
    // pending (transactional — both must sign).
    if (type === 'contract') {
      for (const partyId of [transaction.providerId, transaction.requesterId]) {
        try {
          await this.notificationsService.create({
            userId: partyId,
            type: 'contract_pending',
            payload: {
              listingTitle: listing.title,
              listingId: listing.id,
              transactionId: transaction.id,
            },
          });
        } catch (error: any) {
          this.logger.warn(
            `contract_pending notification failed for ${partyId}: ${error?.message ?? error}`,
          );
        }
      }
    }

    return savedContract;
  }

  /**
   * Génère le PDF final (signatures embarquées + certificat de signature)
   * une fois que les deux parties ont signé. Idempotent : no-op si le PDF
   * signé existe déjà (rejeu BullMQ).
   */
  private async finalizeSignedContract(transactionId: string): Promise<any> {
    const contract = await this.contractModel.findOne({
      pg_transaction_id: transactionId,
      type: 'contract',
    });
    if (!contract) {
      throw new NotFoundException(
        `Contrat pour la transaction ${transactionId} non trouvé`,
      );
    }
    if (contract.signed_pdf) {
      this.logger.log(
        `PDF signé déjà généré pour la transaction ${transactionId} — no-op`,
      );
      return contract;
    }

    const provider = contract.signatures?.provider;
    const requester = contract.signatures?.requester;
    if (!provider || !requester) {
      throw new Error(
        `Contrat ${contract._id.toString()} incomplet : les deux signatures sont requises pour la finalisation`,
      );
    }

    const snapshot = contract.listing_snapshot;
    const pdfBuffer = await this.templateService.renderSignedContract(
      {
        title: snapshot.title,
        providerName: contract.parties.provider.full_name,
        providerEmail: contract.parties.provider.email,
        requesterName: contract.parties.requester.full_name,
        requesterEmail: contract.parties.requester.email,
        priceCents: snapshot.price_cents,
        date: contract.created_at.toISOString(),
        templateKey: snapshot.template_key,
        categoryName: snapshot.category_name,
        neighbourhoodName: snapshot.neighbourhood_name,
      },
      { provider, requester },
      {
        originalSha256: contract.sha256_hash,
        contractId: contract._id.toString(),
        transactionId,
      },
    );

    const filename = `contract_signed_${transactionId}.pdf`;
    const gridfsFileId = await this.gridfsService.upload(
      pdfBuffer,
      filename,
      'application/pdf',
    );
    const sha256Hash = crypto
      .createHash('sha256')
      .update(pdfBuffer)
      .digest('hex');

    const mediaDoc = new this.mediaFileModel({
      owner_type: 'contract',
      owner_id: transactionId,
      gridfs_file_id: gridfsFileId,
      mimetype: 'application/pdf',
      size_bytes: pdfBuffer.length,
      original_filename: filename,
      sha256_hash: sha256Hash,
      contract_type: 'contract_signed',
      uploaded_at: new Date(),
    });
    await mediaDoc.save();

    contract.signed_pdf = {
      gridfs_file_id: gridfsFileId.toString(),
      mimetype: 'application/pdf',
      size_bytes: pdfBuffer.length,
    };
    contract.signed_pdf_sha256 = sha256Hash;
    await contract.save();

    return contract;
  }

  /** Noms de catégorie du plus spécifique au plus général. */
  private async getCategoryChain(categoryId: number | null): Promise<string[]> {
    const chain: string[] = [];
    let currentId = categoryId;
    // Garde-fou anti-boucle sur la hiérarchie des catégories.
    for (let depth = 0; currentId != null && depth < 10; depth++) {
      const category = await this.categoryRepository.findOne({
        where: { id: currentId },
      });
      if (!category) break;
      chain.push(category.categoryName);
      currentId = category.parentCategoryId;
    }
    return chain;
  }
}
