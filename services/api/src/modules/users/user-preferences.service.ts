import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserNotificationPreferences } from './entities/user-notification-preferences.entity';
import { UpdateNotifPrefsDto } from './dto/user-routes.dtos';

@Injectable()
export class UserPreferencesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserNotificationPreferences)
    private readonly notifPrefsRepository: Repository<UserNotificationPreferences>,
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

  async updateLocale(userId: string, locale: string): Promise<{ locale: string }> {
    if (locale !== 'fr' && locale !== 'en') {
      throw new BadRequestException('Locale non supporté (fr ou en uniquement)');
    }

    const result = await this.userRepository.update(userId, { locale });
    if (result.affected === 0) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return { locale };
  }

  async getNotificationPreferences(userId: string): Promise<UserNotificationPreferences> {
    const prefs = await this.notifPrefsRepository.findOne({ where: { userId } });
    if (!prefs) {
      throw new NotFoundException('Préférences de notifications introuvables');
    }
    return prefs;
  }

  async updateNotificationPreferences(userId: string, dto: UpdateNotifPrefsDto): Promise<UserNotificationPreferences> {
    const prefs = await this.notifPrefsRepository.findOne({ where: { userId } });
    if (!prefs) {
      throw new NotFoundException('Préférences de notifications introuvables');
    }

    // Apply partial updates
    Object.assign(prefs, dto);
    prefs.updatedAt = new Date();

    return this.notifPrefsRepository.save(prefs);
  }
}
