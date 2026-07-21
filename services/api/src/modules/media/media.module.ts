import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaFile, MediaFileSchema } from './schemas/media-file.schema';
import { Listing } from '../listings/entities/listing.entity';
import { User } from '../users/entities/user.entity';
import { MessageMetadata } from '../messaging/entities/message-metadata.entity';
import { UsersInGroup } from '../messaging/entities/users-in-group.entity';
import { ListingTransaction } from '../listings/entities/listing-transaction.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Evenement } from '../events/entities/evenement.entity';
import { EventParticipant } from '../events/entities/event-participant.entity';
import { GridFSService } from './services/gridfs.service';
import { UploadPipeline } from './services/upload-pipeline.service';
import { MediaService } from './services/media.service';
import { MediaController } from './media.controller';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MediaFile.name, schema: MediaFileSchema },
    ]),
    TypeOrmModule.forFeature([
      Listing,
      User,
      MessageMetadata,
      UsersInGroup,
      ListingTransaction,
      Incident,
      Evenement,
      EventParticipant,
    ]),
    // Cycle avec MessagingModule (qui importe MediaModule pour les pièces
    // jointes de message) — nécessaire pour notifier le groupe en temps réel
    // (socket) une fois l'upload d'une pièce jointe terminé.
    forwardRef(() => MessagingModule),
  ],
  providers: [GridFSService, UploadPipeline, MediaService],
  controllers: [MediaController],
  exports: [MediaService, GridFSService],
})
export class MediaModule {}
