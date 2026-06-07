import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AdminRgpdService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject('BullQueue_rgpd-anonymise')
    private readonly rgpdAnonymiseQueue: {
      add: (name: string, data: any) => Promise<any>;
    },
  ) {}

  async getRgpdRequests() {
    const users = await this.userRepository.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
    });

    return users.map((user) => {
      const isAnonymized = user.firstName.startsWith('Anonymized-');
      return {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        deletedAt: user.deletedAt,
        status: isAnonymized ? 'completed' : 'pending',
      };
    });
  }

  async getRgpdRequestStatus(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      withDeleted: true,
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!user.deletedAt) {
      return { status: 'none' };
    }
    const isAnonymized = user.firstName.startsWith('Anonymized-');
    return { status: isAnonymized ? 'completed' : 'pending' };
  }

  async anonymizeUserManually(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      withDeleted: true,
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!user.deletedAt) {
      throw new BadRequestException("L'utilisateur n'est pas supprimé");
    }
    if (user.firstName.startsWith('Anonymized-')) {
      throw new ConflictException('Utilisateur déjà anonymisé');
    }

    await this.rgpdAnonymiseQueue.add('user.anonymise', { userId });
    return { success: true };
  }
}
