import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaFile, MediaFileSchema } from './schemas/media-file.schema';
import { Listing } from '../listings/entities/listing.entity';
import { User } from '../users/entities/user.entity';
import { MessageMetadata } from '../messaging/entities/message-metadata.entity';
import { UsersInGroup } from '../messaging/entities/users-in-group.entity';
import { GridFSService } from './services/gridfs.service';
import { UploadPipeline } from './services/upload-pipeline.service';
import { MediaService } from './services/media.service';
import { MediaController } from './media.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MediaFile.name, schema: MediaFileSchema },
    ]),
    TypeOrmModule.forFeature([Listing, User, MessageMetadata, UsersInGroup]),
  ],
  providers: [GridFSService, UploadPipeline, MediaService],
  controllers: [MediaController],
  exports: [MediaService, GridFSService],
})
export class MediaModule {}
