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
import { ChatController } from './chat.controller';
import { ChatAdminController } from './chat-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatGroup,
      UsersInGroup,
      MessageMetadata,
      MessageReadReceipt,
    ]),
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    AuthModule,
  ],
  controllers: [ChatController, ChatAdminController],
  providers: [ChatService, ChatMessageService, ChatGateway],
  exports: [TypeOrmModule, ChatService, ChatMessageService, ChatGateway],
})
export class MessagingModule {}
