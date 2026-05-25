import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvenementsCategory } from './entities/evenements-category.entity';
import { Evenement } from './entities/evenement.entity';
import { EventParticipant } from './entities/event-participant.entity';
import { EventSwipe } from './entities/event-swipe.entity';
import { EventReport } from './entities/event-report.entity';
import { EventModerationAction } from './entities/event-moderation-action.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EvenementsCategory,
      Evenement,
      EventParticipant,
      EventSwipe,
      EventReport,
      EventModerationAction,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class EventsModule {}
