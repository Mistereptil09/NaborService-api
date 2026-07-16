import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { PointsTopup } from './entities/points-topup.entity';
import { PointsService } from './points.service';
import { StripeService } from '../stripe/stripe.service';
import { AdminConfigService } from '../admin/admin-config.service';
import {
  PointsLedgerEntryTypeEnum,
  PointsTopupStatusEnum,
} from '../../common/enums';

@Injectable()
export class PointsTopupService {
  private readonly logger = new Logger(PointsTopupService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PointsTopup)
    private readonly topupRepository: Repository<PointsTopup>,
    private readonly pointsService: PointsService,
    private readonly stripeService: StripeService,
    private readonly adminConfigService: AdminConfigService,
    private readonly configService: ConfigService,
  ) {}

  async createCheckoutSession(
    userId: string,
    amountCents: number,
  ): Promise<{ url: string; topupId: string }> {
    const { centsPerPoint } = await this.adminConfigService.getConfig();
    const pointsPurchased = Math.floor(amountCents / centsPerPoint);

    const topup = this.topupRepository.create({
      userId,
      amountCents,
      pointsPurchased,
      centsPerPoint,
      status: PointsTopupStatusEnum.PENDING,
    });
    await this.topupRepository.save(topup);

    const frontendUrl = this.configService.get<string>(
      'CORS_ORIGIN',
      'http://localhost:5173',
    );

    const session = await this.stripeService.createCheckoutSession({
      amountCents,
      productName: `Achat de ${pointsPurchased} points`,
      successUrl: `${frontendUrl}/points?topup=success`,
      cancelUrl: `${frontendUrl}/points?topup=cancel`,
      metadata: { topupId: topup.id },
    });

    topup.stripeCheckoutSessionId = session.id;
    await this.topupRepository.save(topup);

    return { url: session.url!, topupId: topup.id };
  }

  async markCompleted(session: Record<string, any>): Promise<void> {
    const topupId = session.metadata?.topupId;
    const topup = topupId
      ? await this.topupRepository.findOne({ where: { id: topupId } })
      : await this.topupRepository.findOne({
          where: { stripeCheckoutSessionId: session.id },
        });

    if (!topup) {
      this.logger.warn(
        `Received checkout.session.completed for unknown topup (session ${session.id})`,
      );
      return;
    }
    if (topup.status === PointsTopupStatusEnum.COMPLETED) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      topup.status = PointsTopupStatusEnum.COMPLETED;
      topup.completedAt = new Date();
      topup.stripePaymentIntentId = session.payment_intent ?? null;
      await manager.save(topup);

      await this.pointsService.credit(
        {
          userId: topup.userId,
          amountPoints: topup.pointsPurchased,
          type: PointsLedgerEntryTypeEnum.TOPUP,
          referenceType: 'points_topup',
          referenceId: topup.id,
        },
        manager,
      );
    });
  }

  async markFailed(session: Record<string, any>, reason: string): Promise<void> {
    const topupId = session.metadata?.topupId;
    const topup = topupId
      ? await this.topupRepository.findOne({ where: { id: topupId } })
      : await this.topupRepository.findOne({
          where: { stripeCheckoutSessionId: session.id },
        });

    if (!topup || topup.status !== PointsTopupStatusEnum.PENDING) {
      return;
    }

    topup.status = PointsTopupStatusEnum.FAILED;
    topup.failedAt = new Date();
    topup.failureReason = reason;
    await this.topupRepository.save(topup);
  }
}
