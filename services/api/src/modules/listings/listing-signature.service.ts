import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import {
  Contract,
  ContractDocument,
} from '../../database/mongo-schemas/schemas/contract.schema';
import { User } from '../users/entities/user.entity';
import { ListingTransactionService } from './listing-transaction.service';
import { TotpService } from '../auth/totp.service';
import { SignDocumentDto } from './dto/listing-routes.dtos';
import { GridFSService } from '../media/services/gridfs.service';
import { NotificationsService } from '../messaging/notifications.service';
import {
  getSignatureState,
  getUserRole,
} from '../documents/contract-signature.util';

@Injectable()
export class ListingSignatureService {
  private readonly logger = new Logger(ListingSignatureService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    private readonly transactionService: ListingTransactionService,
    private readonly totpService: TotpService,
    private readonly gridfsService: GridFSService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue('pdf-generation')
    private readonly pdfGenerationQueue: Queue,
  ) {}

  async signDocument(
    userId: string,
    listingId: string,
    dto: SignDocumentDto,
    ip: string | null = null,
    userAgent: string | null = null,
  ): Promise<any> {
    if (!dto.canvas_b64 || dto.canvas_b64.trim() === '') {
      throw new BadRequestException('Le canvas de signature est obligatoire');
    }
    if (!dto.canvas_b64.startsWith('data:image/png;base64,')) {
      throw new BadRequestException(
        'La signature doit être une image PNG (data URL)',
      );
    }
    if (!dto.totp_code || dto.totp_code.length !== 6) {
      throw new BadRequestException('Code TOTP invalide');
    }

    const transaction =
      await this.transactionService.findByListingId(listingId);
    await this.transactionService.verifyPartyAccess(userId, transaction);

    const contract = await this.contractModel.findOne({
      pg_transaction_id: transaction.id,
      type: 'contract',
    });
    if (!contract) {
      throw new NotFoundException('Contrat introuvable');
    }

    const role = getUserRole(contract, userId);
    if (!role) {
      throw new ForbiddenException("Vous n'êtes pas signataire de ce document");
    }

    const state = getSignatureState(contract);
    if (state.fullySigned) {
      throw new ConflictException('Document déjà signé');
    }
    if (contract.signatures?.[role]) {
      throw new ConflictException('Vous avez déjà signé ce document');
    }

    await this.totpService.verifyTotp(userId, dto.totp_code);

    const gridfsFile = await this.gridfsService.download(
      new Types.ObjectId(contract.pdf.gridfs_file_id),
    );
    const computedHash = crypto
      .createHash('sha256')
      .update(gridfsFile.buffer)
      .digest('hex');

    if (computedHash !== contract.sha256_hash) {
      throw new ConflictException('Intégrité du document compromise');
    }

    const now = new Date();
    contract.signatures = {
      ...contract.signatures,
      [role]: {
        canvas_b64: dto.canvas_b64,
        totp_verified_at: now,
        signed_ip: ip,
        user_agent: userAgent,
        signed_at: now,
      },
    };

    const otherRole = role === 'provider' ? 'requester' : 'provider';
    const otherPartyId =
      role === 'provider' ? transaction.requesterId : transaction.providerId;
    const fullySigned = !!contract.signatures[otherRole];

    if (fullySigned) {
      contract.signed_at = now;
    }

    const savedContract = await contract.save();

    if (fullySigned) {
      await this.pdfGenerationQueue.add('finalize-signed-contract', {
        transactionId: transaction.id,
      });

      for (const partyId of [transaction.providerId, transaction.requesterId]) {
        try {
          await this.notificationsService.create({
            userId: partyId,
            type: 'contract_fully_signed',
            payload: {
              listingId,
              transactionId: transaction.id,
              documentId: savedContract._id.toString(),
            },
          });
        } catch (error: any) {
          this.logger.warn(
            `contract_fully_signed notification failed for ${partyId}: ${error?.message ?? error}`,
          );
        }
      }
    } else {
      try {
        await this.notificationsService.create({
          userId: otherPartyId,
          type: 'contract_signed',
          payload: {
            listingId,
            transactionId: transaction.id,
            documentId: savedContract._id.toString(),
          },
        });
      } catch (error: any) {
        this.logger.warn(
          `contract_signed notification failed for ${otherPartyId}: ${error?.message ?? error}`,
        );
      }
    }

    const finalState = getSignatureState(savedContract);
    return {
      success: true,
      myRole: role,
      providerSignedAt: finalState.providerSignedAt,
      requesterSignedAt: finalState.requesterSignedAt,
      fullySigned: finalState.fullySigned,
      signedAt: savedContract.signed_at,
      sha256Hash: savedContract.sha256_hash,
    };
  }

  async getSignatureStatus(userId: string, listingId: string): Promise<any> {
    const transaction =
      await this.transactionService.findByListingId(listingId);
    await this.transactionService.verifyPartyAccess(userId, transaction);

    const contract = await this.contractModel.findOne(
      { pg_transaction_id: transaction.id, type: 'contract' },
      {
        'signatures.provider.canvas_b64': 0,
        'signatures.requester.canvas_b64': 0,
      },
    );
    if (!contract) {
      throw new NotFoundException('Contrat introuvable');
    }

    const role = getUserRole(contract, userId);
    const state = getSignatureState(contract);
    const mySignedAt =
      role === 'provider' ? state.providerSignedAt : state.requesterSignedAt;

    return {
      documentId: contract._id.toString(),
      myRole: role,
      iSigned: mySignedAt !== null,
      providerSignedAt: state.providerSignedAt,
      requesterSignedAt: state.requesterSignedAt,
      fullySigned: state.fullySigned,
      signedAt: contract.signed_at,
      hasSignedPdf: !!contract.signed_pdf,
      providerName: contract.parties.provider.full_name,
      requesterName: contract.parties.requester.full_name,
      sha256Hash: contract.sha256_hash,
    };
  }

  async getContract(
    userId: string,
    listingId: string,
    type: 'contract' | 'receipt',
  ): Promise<ContractDocument> {
    const transaction =
      await this.transactionService.findByListingId(listingId);
    await this.transactionService.verifyPartyAccess(userId, transaction);

    const doc = await this.contractModel.findOne({
      pg_transaction_id: transaction.id,
      type,
    });

    if (!doc) {
      throw new NotFoundException(
        `Aucun ${type === 'contract' ? 'contrat' : 'reçu'} trouvé pour cette annonce`,
      );
    }

    return doc;
  }

  async getContractStream(
    userId: string,
    listingId: string,
    type: 'contract' | 'receipt',
    original = false,
  ): Promise<{
    stream: any;
    mimetype: string;
    sizeBytes: number;
  }> {
    const doc = await this.getContract(userId, listingId, type);

    const pdf = !original && doc.signed_pdf ? doc.signed_pdf : doc.pdf;

    const stream = this.gridfsService.openDownloadStream(
      new Types.ObjectId(pdf.gridfs_file_id),
    );

    return {
      stream,
      mimetype: pdf.mimetype,
      sizeBytes: pdf.size_bytes,
    };
  }
}
