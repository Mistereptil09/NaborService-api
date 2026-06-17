import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Contract,
  ContractDocument,
} from '../../database/mongo-schemas/schemas/contract.schema';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
  ) {}

  /**
   * Retrieve a document by its MongoDB document ID.
   * Checks that the requesting user is a party to the document.
   * Used by: GET /documents/:document_id
   */
  async findById(documentId: string, userId?: string): Promise<ContractDocument> {
    const doc = await this.contractModel.findById(documentId);

    if (!doc) {
      throw new NotFoundException('Document introuvable');
    }

    // If userId is provided, verify the user is a party to the document
    if (userId) {
      const isProvider = doc.parties?.provider?.pg_user_id === userId;
      const isRequester = doc.parties?.requester?.pg_user_id === userId;
      if (!isProvider && !isRequester) {
        throw new ForbiddenException(
          'Vous n\'êtes pas signataire de ce document',
        );
      }
    }

    return doc;
  }

  /**
   * Retrieve a document by transaction ID and type.
   */
  async findByTransaction(
    transactionId: string,
    type: 'contract' | 'receipt',
  ): Promise<ContractDocument | null> {
    return this.contractModel.findOne({
      pg_transaction_id: transactionId,
      type,
    });
  }

  /**
   * Create a contract document record in MongoDB.
   */
  async createContract(data: {
    pg_transaction_id: string;
    type: 'contract' | 'receipt';
    sha256_hash: string;
    pdfBuffer: Buffer;
    parties: Contract['parties'];
    listing_snapshot: Contract['listing_snapshot'];
  }): Promise<ContractDocument> {
    const doc = new this.contractModel({
      pg_transaction_id: data.pg_transaction_id,
      type: data.type,
      sha256_hash: data.sha256_hash,
      pdf: {
        data: data.pdfBuffer,
        mimetype: 'application/pdf',
        size_bytes: data.pdfBuffer.length,
      },
      parties: data.parties,
      listing_snapshot: data.listing_snapshot,
      signature: null,
      signed_at: null,
      created_at: new Date(),
      anonymised_at: null,
    });

    return doc.save();
  }

  /**
   * Admin access — no party check.
   * Used by: GET /admin/documents/:document_id
   */
  async findByIdAdmin(documentId: string): Promise<ContractDocument> {
    const doc = await this.contractModel.findById(documentId);
    if (!doc) {
      throw new NotFoundException('Document introuvable');
    }
    return doc;
  }
}
