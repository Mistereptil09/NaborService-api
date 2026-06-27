import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserNotificationPreferences } from '../../common/entities/user-notification-preferences.entity';
import { UpdateNotifPrefsDto } from './dto/user-routes.dtos';
import { DataProcessingService } from './data-processing.service';
import { ESSENTIAL_EMAILS } from './data-processing.constants';
import { NotifPreferenceKey } from '../../queue/interfaces/job-payloads';

@Injectable()
export class UserPreferencesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserNotificationPreferences)
    private readonly notifPrefsRepository: Repository<UserNotificationPreferences>,
    private readonly dataProcessingService: DataProcessingService,
  ) {}

  async getLocale(userId: string): Promise<{ locale: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['locale'],
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return { locale: user.locale };
  }

  async updateLocale(
    userId: string,
    locale: string,
  ): Promise<{ locale: string }> {
    if (locale !== 'fr' && locale !== 'en') {
      throw new BadRequestException(
        'Locale non supporté (fr ou en uniquement)',
      );
    }

    const result = await this.userRepository.update(userId, { locale });
    if (result.affected === 0) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return { locale };
  }

  async getNotificationPreferences(
    userId: string,
  ): Promise<UserNotificationPreferences> {
    const prefs = await this.notifPrefsRepository.findOne({
      where: { userId },
    });
    if (!prefs) {
      throw new NotFoundException('Préférences de notifications introuvables');
    }
    return prefs;
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotifPrefsDto,
  ): Promise<UserNotificationPreferences> {
    const prefs = await this.notifPrefsRepository.findOne({
      where: { userId },
    });
    if (!prefs) {
      throw new NotFoundException('Préférences de notifications introuvables');
    }

    // Apply partial updates
    Object.assign(prefs, dto);
    prefs.updatedAt = new Date();

    return this.notifPrefsRepository.save(prefs);
  }

  async canReceiveEmail(
    userId: string,
    templateName: string,
  ): Promise<boolean> {
    const isEssential = ESSENTIAL_EMAILS.includes(templateName as any);
    if (isEssential) {
      return true;
    }

    const isOptedOut = await this.dataProcessingService.isOptedOut(
      userId,
      'notifications',
    );
    if (isOptedOut) {
      return false;
    }

    const prefs = await this.notifPrefsRepository.findOne({
      where: { userId },
    });
    if (!prefs) {
      return true;
    }

    if (templateName === 'event:waitlist_promoted' && !prefs.notifWaitlist)
      return false;
    if (
      templateName.startsWith('event:') &&
      templateName !== 'event:waitlist_promoted' &&
      !prefs.notifNewEvent
    )
      return false;
    if (templateName === 'new_follower' && !prefs.notifNewFollower)
      return false;
    if (templateName === 'new_listing' && !prefs.notifNewListing) return false;
    if (templateName === 'new_poll' && !prefs.notifNewPoll) return false;

    return true;
  }

  /**
   * Returns whether a non-essential email gated by `preferenceKey` may be sent
   * to the user. Honours the global "notifications" opt-out, then the specific
   * notification flag. Defaults to true when no preferences row exists.
   */
  async isPreferenceEnabled(
    userId: string,
    preferenceKey: NotifPreferenceKey,
  ): Promise<boolean> {
    const isOptedOut = await this.dataProcessingService.isOptedOut(
      userId,
      'notifications',
    );
    if (isOptedOut) {
      return false;
    }

    const prefs = await this.notifPrefsRepository.findOne({
      where: { userId },
    });
    if (!prefs) {
      return true;
    }

    return prefs[preferenceKey] !== false;
  }
}
