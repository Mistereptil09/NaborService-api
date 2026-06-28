import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatGroup } from './entities/chat-group.entity';
import { UsersInGroup } from './entities/users-in-group.entity';
import { MessageMetadata } from './entities/message-metadata.entity';
import { MessageReadReceipt } from './entities/message-read-receipt.entity';
import {
  Message,
  MessageSchema,
} from '../../database/mongo-schemas/schemas/message.schema';
import { AuthModule } from '../auth/auth.module';
import { ChatService } from './chat.service';
import { ChatMessageService } from './chat-message.service';
import { ChatGateway } from './chat.gateway';
import { PresenceGateway } from './presence.gateway';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { ChatController } from './chat.controller';
import { ChatAdminController } from './chat-admin.controller';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatGroup,
      UsersInGroup,
      MessageMetadata,
      MessageReadReceipt,
      Notification,
      User,
    ]),
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    AuthModule,
  ],
  controllers: [ChatController, ChatAdminController, NotificationsController],
  providers: [
    ChatService,
    ChatMessageService,
    ChatGateway,
    PresenceGateway,
    NotificationsGateway,
    NotificationsService,
  ],
  exports: [
    TypeOrmModule,
    ChatService,
    ChatMessageService,
    ChatGateway,
    NotificationsService,
  ],
})
export class MessagingModule {}
