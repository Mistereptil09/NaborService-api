import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { EvenementsCategory } from './entities/evenements-category.entity';
import { Evenement } from './entities/evenement.entity';
import { EventParticipant } from './entities/event-participant.entity';
import { EventSwipe } from './entities/event-swipe.entity';
import { EventReport } from './entities/event-report.entity';
import { EventModerationAction } from './entities/event-moderation-action.entity';
import { ChatGroup } from '../messaging/entities/chat-group.entity';
import { User } from '../users/entities/user.entity';
import { UserBlock } from '../social/entities/user-block.entity';

import {
  EventDocument,
  EventDocumentSchema,
} from '../../database/mongo-schemas/schemas/event-document.schema';
import {
  EventTicket,
  EventTicketSchema,
} from '../../database/mongo-schemas/schemas/event-ticket.schema';

import { EventsService } from './events.service';
import { EventContentService } from './event-content.service';
import { EventMediaService } from './event-media.service';
import { EventStateMachineService } from './event-state-machine.service';
import { EventTicketService } from './event-ticket.service';
import { EventReportService } from './event-report.service';
import { EventModerationService } from './event-moderation.service';
import { EventsGateway } from './events.gateway';
import { EventsController } from './events.controller';

import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PointsModule } from '../points/points.module';
import { AdminModule } from '../admin/admin.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EvenementsCategory,
      Evenement,
      EventParticipant,
      EventSwipe,
      EventReport,
      EventModerationAction,
      ChatGroup,
      User,
      UserBlock,
    ]),
    MongooseModule.forFeature([
      { name: EventDocument.name, schema: EventDocumentSchema },
      { name: EventTicket.name, schema: EventTicketSchema },
    ]),
    BullModule.registerQueue(
      { name: 'event-register' },
      { name: 'waitlist-promote' },
      { name: 'waitlist-confirm' },
      { name: 'neo4j-sync' },
      { name: 'email' },
    ),
    AuthModule,
    MediaModule,
    MessagingModule,
    PointsModule,
    AdminModule,
  ],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventContentService,
    EventMediaService,
    EventStateMachineService,
    EventTicketService,
    EventReportService,
    EventModerationService,
    EventsGateway,
  ],
  exports: [
    EventsService,
    EventContentService,
    EventMediaService,
    EventStateMachineService,
    EventTicketService,
    EventReportService,
    EventModerationService,
    EventsGateway,
  ],
})
export class EventsModule {}
