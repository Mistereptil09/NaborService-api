import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserDataProcessing } from './entities/user-data-processing.entity';
import { DataProcessingService } from './data-processing.service';
import { TotpService } from '../auth/totp.service';
import { RectifyDataDto } from './dto/user-routes.dtos';
import { PROCESSING_TYPES, ProcessingType } from './data-processing.constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticator } = require('otplib');

@Injectable()
export class UserRgpdService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserDataProcessing)
    private readonly dataProcessingRepository: Repository<UserDataProcessing>,
    private readonly dataProcessingService: DataProcessingService,
    private readonly totpService: TotpService,
  ) {}

  private async verifyUserTotp(userId: string, code: string): Promise<void> {
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

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      throw new ForbiddenException('TOTP requis ou invalide');
    }
  }

  async rectifyPersonalData(userId: string, dto: RectifyDataDto): Promise<void> {
    await this.verifyUserTotp(userId, dto.totpCode);

    if (dto.email) {
      const existing = await this.userRepository.findOne({ where: { email: dto.email } });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email déjà utilisé');
      }
    }

    const updatePayload: any = {};
    if (dto.firstName) updatePayload.firstName = dto.firstName;
    if (dto.lastName) updatePayload.lastName = dto.lastName;
    if (dto.email) updatePayload.email = dto.email;

    if (Object.keys(updatePayload).length > 0) {
      await this.userRepository.update(userId, updatePayload);
    }
  }

  async addOptOut(userId: string, processingType: string): Promise<void> {
    if (!PROCESSING_TYPES.includes(processingType as ProcessingType)) {
      throw new BadRequestException('Type de traitement invalide');
    }

    const isOpted = await this.dataProcessingService.isOptedOut(userId, processingType);
    if (isOpted) {
      throw new ConflictException('Déjà opposé à ce traitement');
    }

    const record = await this.dataProcessingRepository.findOne({ where: { userId } });
    const currentOptOuts = record ? record.optOuts : [];
    const updatedOptOuts = Array.from(new Set([...currentOptOuts, processingType]));

    await this.dataProcessingService.setOptOuts(userId, updatedOptOuts);
  }

  async getOptOuts(userId: string): Promise<string[]> {
    return this.dataProcessingService.getEffectiveOptOuts(userId);
  }

  async removeOptOut(userId: string, processingType: string): Promise<void> {
    if (!PROCESSING_TYPES.includes(processingType as ProcessingType)) {
      throw new BadRequestException('Type de traitement invalide');
    }

    const record = await this.dataProcessingRepository.findOne({ where: { userId } });
    if (!record) {
      throw new NotFoundException('Préférences RGPD introuvables');
    }

    if (!record.optOuts.includes(processingType)) {
      throw new NotFoundException('Non opposé à ce traitement');
    }

    const updatedOptOuts = record.optOuts.filter((o) => o !== processingType);
    await this.dataProcessingService.setOptOuts(userId, updatedOptOuts);
  }

  async activateRestriction(userId: string): Promise<void> {
    const record = await this.dataProcessingRepository.findOne({ where: { userId } });
    if (record && record.isRestricted) {
      throw new ConflictException('Limitation déjà active');
    }

    await this.dataProcessingService.setRestricted(userId, true);
  }

  async deactivateRestriction(userId: string): Promise<void> {
    await this.dataProcessingService.setRestricted(userId, false);
  }
}
