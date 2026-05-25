import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { UserNotificationPreferences } from './entities/user-notification-preferences.entity';
import { UserDataProcessing } from './entities/user-data-processing.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DataProcessingService } from './data-processing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSession,
      UserNotificationPreferences,
      UserDataProcessing,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, DataProcessingService],
  exports: [UsersService, DataProcessingService],
})
export class UsersModule {}
