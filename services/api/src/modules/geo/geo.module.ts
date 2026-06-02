import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BanService } from './ban.service';
import { Neo4jGeoService } from './neo4j-geo.service';
import { GeoPipelineProcessor } from './geo-pipeline.processor';
import { GeoReconciliationService } from './geo-reconciliation.service';
import { NeighbourhoodAdminController } from './neighbourhood-admin.controller';
import { Neo4jModule } from '../../database/neo4j/neo4j.module';
import { User } from '../users/entities/user.entity';
import { Listing } from '../listings/entities/listing.entity';
import { Evenement } from '../events/entities/evenement.entity';

import { HttpRetryModule } from '../../common/http-retry/http-retry.module';

@Module({
  imports: [
    Neo4jModule,
    TypeOrmModule.forFeature([User, Listing, Evenement]),
    HttpRetryModule,
  ],
  controllers: [NeighbourhoodAdminController],
  providers: [
    BanService,
    Neo4jGeoService,
    GeoPipelineProcessor,
    GeoReconciliationService,
  ],
  exports: [
    BanService,
    Neo4jGeoService,
    GeoPipelineProcessor,
    GeoReconciliationService,
  ],
})
export class GeoModule {}
