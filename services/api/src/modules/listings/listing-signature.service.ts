import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  Contract,
  ContractDocument,
} from '../../database/mongo-schemas/schemas/contract.schema';
import { User } from '../users/entities/user.entity';
import { ListingTransactionService } from './listing-transaction.service';
import { TotpService } from '../auth/totp.service';
import { SignDocumentDto } from './dto/listing-routes.dtos';
import { MediaService } from '../media/services/media.service';
import { GridFSService } from '../media/services/gridfs.service';
import { NotificationsService } from '../messaging/notifications.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticator } = require('otplib');

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
    private readonly mediaService: MediaService,
    private readonly gridfsService: GridFSService,
    private readonly notificationsService: NotificationsService,
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
    if (!dto.totp_code || dto.totp_code.length !== 6) {
      throw new BadRequestException('Code TOTP invalide');
    }

    const transaction =
      await this.transactionService.findByListingId(listingId);
    await this.transactionService.verifyPartyAccess(userId, transaction);

    const contract = await this.contractModel.findOne({
      pg_transaction_id: transaction.id,
    });
    if (!contract) {
      throw new NotFoundException('Contrat introuvable');
    }

    // Enforce signed document immutability
    if (contract.signed_at !== null) {
      throw new ConflictException('Document déjà signé');
    }

    // Verify TOTP
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!user.totpSecret) {
      throw new ForbiddenException('TOTP non configuré');
    }

    let secret: string;
    try {
      secret = this.totpService.decryptSecret(user.totpSecret);
    } catch {
      throw new ForbiddenException('Erreur de déchiffrement du secret');
    }

    const isValid = authenticator.verify({ token: dto.totp_code, secret });
    if (!isValid) {
      throw new ForbiddenException('TOTP requis ou invalide');
    }

    // Verify SHA-256 PDF integrity using the new MediaService & GridFSService
    const mediaFiles = await this.mediaService.findByOwner(
      'contract',
      transaction.id,
    );
    const contractFile = mediaFiles.find((m) => m.contract_type === 'contract');
    if (!contractFile) {
      throw new NotFoundException('Contrat introuvable');
    }
    const gridfsFile = await this.gridfsService.download(
      contractFile.gridfs_file_id,
    );
    const computedHash = crypto
      .createHash('sha256')
      .update(gridfsFile.buffer)
      .digest('hex');

    if (computedHash !== contract.sha256_hash) {
      throw new ConflictException('Intégrité du document compromise');
    }

    // Save signature
    contract.signature = {
      canvas_b64: dto.canvas_b64,
      totp_verified_at: new Date(),
      signed_ip: ip,
      user_agent: userAgent,
    };
    contract.signed_at = new Date();

    const savedContract = await contract.save();

    // Notify the OTHER party that the contract was signed (transactional).
    const otherPartyId =
      userId === transaction.providerId
        ? transaction.requesterId
        : transaction.providerId;
    try {
      await this.notificationsService.create({
        userId: otherPartyId,
        type: 'contract_signed',
        payload: { listingId, transactionId: transaction.id },
      });
    } catch (error: any) {
      this.logger.warn(
        `contract_signed notification failed for ${otherPartyId}: ${error?.message ?? error}`,
      );
    }

    return {
      success: true,
      signed_at: savedContract.signed_at,
      sha256_hash: savedContract.sha256_hash,
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
  ): Promise<{
    stream: any;
    mimetype: string;
    sizeBytes: number;
  }> {
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

    const mediaFiles = await this.mediaService.findByOwner(
      'contract',
      transaction.id,
    );
    const contractFile = mediaFiles.find((m) => m.contract_type === type);
    if (!contractFile) {
      throw new NotFoundException('Fichier de contrat introuvable');
    }

    const stream = this.gridfsService.openDownloadStream(
      contractFile.gridfs_file_id,
    );

    return {
      stream,
      mimetype: contractFile.mimetype,
      sizeBytes: contractFile.size_bytes,
    };
  }
}
