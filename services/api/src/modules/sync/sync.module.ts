import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Neo4jModule } from '../../database/neo4j/neo4j.module';

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
import { SyncConflict } from './entities/sync-conflict.entity';
import { EntityPatchHandler } from './handlers/entity-patch.handler';

import { ListingCategory } from '../listings/entities/listing-category.entity';
import { EvenementsCategory } from '../events/entities/evenements-category.entity';
import { PollOption } from '../polls/entities/poll-option.entity';
import { EventParticipant } from '../events/entities/event-participant.entity';
import { UsersInGroup } from '../messaging/entities/users-in-group.entity';

import { Follow } from '../social/entities/follow.entity';
import { Friendship } from '../social/entities/friendship.entity';

@Module({
  imports: [
    Neo4jModule,
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
      SyncConflict,
      ListingCategory,
      EvenementsCategory,
      PollOption,
      EventParticipant,
      UsersInGroup,
      Follow,
      Friendship,
    ]),
  ],
  controllers: [SyncController],
  providers: [SyncService, EntityPatchHandler],
  exports: [SyncService],
})
export class SyncModule {}
