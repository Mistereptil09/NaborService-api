import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformConfig } from './entities/platform-config.entity';
import { User } from '../users/entities/user.entity';
import { Listing } from '../listings/entities/listing.entity';
import { Evenement } from '../events/entities/evenement.entity';
import { ListingTransaction } from '../listings/entities/listing-transaction.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { EventParticipant } from '../events/entities/event-participant.entity';
import { PointsLedgerEntry } from '../points/entities/points-ledger-entry.entity';
import { PointsModule } from '../points/points.module';

import { AdminConfigService } from './admin-config.service';
import { AdminConfigController } from './admin-config.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsController } from './admin-stats.controller';
import { AdminRgpdService } from './admin-rgpd.service';
import { AdminRgpdController } from './admin-rgpd.controller';
import { AdminPointsController } from './admin-points.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformConfig,
      User,
      Listing,
      Evenement,
      ListingTransaction,
      Incident,
      EventParticipant,
      PointsLedgerEntry,
    ]),
    forwardRef(() => PointsModule),
  ],
  controllers: [
    AdminConfigController,
    AdminStatsController,
    AdminRgpdController,
    AdminPointsController,
  ],
  providers: [AdminConfigService, AdminStatsService, AdminRgpdService],
  exports: [AdminConfigService],
})
export class AdminModule {}
