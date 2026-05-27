import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { User } from './entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { UserNotificationPreferences } from './entities/user-notification-preferences.entity';
import { UserDataProcessing } from './entities/user-data-processing.entity';
import { UserReport } from './entities/user-report.entity';
import { Follow } from '../social/entities/follow.entity';
import { Friendship } from '../social/entities/friendship.entity';
import { UserBlock } from '../social/entities/user-block.entity';
import { UserSwipe } from '../social/entities/user-swipe.entity';

import { UserMedia, UserMediaSchema } from '../../database/mongo-schemas/schemas/user-media.schema';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DataProcessingService } from './data-processing.service';

import { UserMediaService } from './user-media.service';
import { UserSecurityService } from './user-security.service';
import { UserPreferencesService } from './user-preferences.service';
import { UserRgpdService } from './user-rgpd.service';
import { UserDiscoveryService } from './user-discovery.service';
import { UserSocialService } from './user-social.service';

import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';

const mockQueue = {
  add: async (name: string, data: any) => {
    console.log(`[Mock Queue Job added] name: ${name}, data:`, data);
    return { id: `mock-job-${Date.now()}` };
  },
};

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSession,
      UserNotificationPreferences,
      UserDataProcessing,
      UserReport,
      Follow,
      Friendship,
      UserBlock,
      UserSwipe,
    ]),
    MongooseModule.forFeature([{ name: UserMedia.name, schema: UserMediaSchema }]),
    AuthModule,
    MediaModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    DataProcessingService,
    UserMediaService,
    UserSecurityService,
    UserPreferencesService,
    UserRgpdService,
    UserDiscoveryService,
    UserSocialService,
    {
      provide: 'BullQueue_neo4j-sync',
      useValue: mockQueue,
    },
    {
      provide: 'BullQueue_rgpd-anonymise',
      useValue: mockQueue,
    },
  ],
  exports: [
    UsersService,
    DataProcessingService,
    UserMediaService,
    UserSecurityService,
    UserPreferencesService,
    UserRgpdService,
    UserDiscoveryService,
    UserSocialService,
  ],
})
export class UsersModule {}
