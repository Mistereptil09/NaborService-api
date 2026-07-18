import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PointsCashout } from './entities/points-cashout.entity';
import { User } from '../users/entities/user.entity';
import { PointsService } from './points.service';
import { StripeService } from '../stripe/stripe.service';
import { AdminConfigService } from '../admin/admin-config.service';
import {
  PointsCashoutStatusEnum,
  PointsLedgerEntryTypeEnum,
} from '../../common/enums';

@Injectable()
export class PointsCashoutService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PointsCashout)
    private readonly cashoutRepository: Repository<PointsCashout>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly pointsService: PointsService,
    private readonly stripeService: StripeService,
    private readonly adminConfigService: AdminConfigService,
  ) {}

  async createCashout(
    userId: string,
    amountPoints: number,
  ): Promise<PointsCashout> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!user.stripeAccountId || !user.payoutsEnabled) {
      throw new ConflictException(
        "Compte de paiement non configuré : terminez l'onboarding avant de retirer vos points",
      );
    }

    const { centsPerPoint } = await this.adminConfigService.getConfig();
    const amountCents = amountPoints * centsPerPoint;

    return this.dataSource.transaction(async (manager) => {
      const cashout = manager.create(PointsCashout, {
        userId,
        amountPoints,
        amountCents,
        centsPerPoint,
        status: PointsCashoutStatusEnum.PENDING,
      });
      await manager.save(cashout);

      // Débit immédiat (verrou pessimiste dans PointsService) pour empêcher
      // tout double retrait pendant l'appel réseau vers Stripe ci-dessous.
      await this.pointsService.debit(
        {
          userId,
          amountPoints,
          type: PointsLedgerEntryTypeEnum.CASHOUT,
          referenceType: 'points_cashout',
          referenceId: cashout.id,
        },
        manager,
      );

      try {
        const transfer = await this.stripeService.createTransfer(
          amountCents,
          user.stripeAccountId!,
          { cashoutId: cashout.id },
        );

        cashout.status = PointsCashoutStatusEnum.COMPLETED;
        cashout.stripeTransferId = transfer.id;
        cashout.completedAt = new Date();
        return manager.save(cashout);
      } catch (err: any) {
        // Le virement Stripe a échoué : on recrédite les points débités
        // au lieu de laisser l'utilisateur perdre son solde pour rien.
        await this.pointsService.credit(
          {
            userId,
            amountPoints,
            type: PointsLedgerEntryTypeEnum.CASHOUT_REVERSED,
            referenceType: 'points_cashout',
            referenceId: cashout.id,
          },
          manager,
        );

        cashout.status = PointsCashoutStatusEnum.FAILED;
        cashout.failureReason = err?.message ?? 'stripe_transfer_failed';
        cashout.failedAt = new Date();
        await manager.save(cashout);

        throw new ConflictException(
          'Le virement a échoué : vos points ont été recrédités.',
        );
      }
    });
  }
}
