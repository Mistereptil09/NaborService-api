import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

import { User } from '../users/entities/user.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Listing } from '../listings/entities/listing.entity';
import { Evenement } from '../events/entities/evenement.entity';
import { ListingModerationAction } from '../listings/entities/listing-moderation-action.entity';
import { EventModerationAction } from '../events/entities/event-moderation-action.entity';
import { ListingReport } from '../listings/entities/listing-report.entity';
import { EventReport } from '../events/entities/event-report.entity';
import { ListingTransaction } from '../listings/entities/listing-transaction.entity';
import { ChatGroup } from '../messaging/entities/chat-group.entity';
import { Poll } from '../polls/entities/poll.entity';
import { Vote } from '../polls/entities/vote.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Incident,
      Listing,
      Evenement,
      ListingModerationAction,
      EventModerationAction,
      ListingReport,
      EventReport,
      ListingTransaction,
      ChatGroup,
      Poll,
      Vote,
    ]),
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
