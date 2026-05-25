import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroup } from './entities/chat-group.entity';
import { UsersInGroup } from './entities/users-in-group.entity';
import { MessageMetadata } from './entities/message-metadata.entity';
import { MessageReadReceipt } from './entities/message-read-receipt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatGroup, UsersInGroup, MessageMetadata, MessageReadReceipt])],
  exports: [TypeOrmModule],
})
export class MessagingModule {}
