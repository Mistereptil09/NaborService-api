import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident } from './entities/incident.entity';
import { User } from '../users/entities/user.entity';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { IncidentSyncService } from './incident-sync.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [TypeOrmModule.forFeature([Incident, User]), SyncModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentSyncService],
  exports: [TypeOrmModule, IncidentsService, IncidentSyncService],
})
export class IncidentsModule {}
