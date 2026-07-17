import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class PointsConnectService {
  private readonly logger = new Logger(PointsConnectService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  async getStatus(userId: string): Promise<{ hasAccount: boolean; payoutsEnabled: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return {
      hasAccount: Boolean(user.stripeAccountId),
      payoutsEnabled: user.payoutsEnabled,
    };
  }

  /** Crée le compte connecté si besoin, puis renvoie un lien d'onboarding Stripe. */
  async createOnboardingLink(userId: string): Promise<{ url: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!user.stripeAccountId) {
      user.stripeAccountId = await this.stripeService.createConnectAccount(user.email);
      await this.userRepository.save(user);
    }

    const frontendUrl = this.configService.get<string>(
      'CORS_ORIGIN',
      'http://localhost:5173',
    );

    const url = await this.stripeService.createAccountLink(
      user.stripeAccountId,
      `${frontendUrl}/points?connect=refresh`,
      `${frontendUrl}/points?connect=return`,
    );

    return { url };
  }

  /** Webhook `account.updated` : synchronise l'éligibilité au cashout. */
  async handleAccountUpdated(account: Record<string, any>): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { stripeAccountId: account.id },
    });
    if (!user) {
      this.logger.warn(
        `Received account.updated for unknown Stripe account (${account.id})`,
      );
      return;
    }

    user.payoutsEnabled = Boolean(account.charges_enabled && account.payouts_enabled);
    await this.userRepository.save(user);
  }
}
