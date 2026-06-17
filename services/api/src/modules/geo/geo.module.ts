import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BanService } from './ban.service';
import { Neo4jGeoService } from './neo4j-geo.service';
import { GeoPipelineProcessor } from './geo-pipeline.processor';
import { GeoReconciliationService } from './geo-reconciliation.service';
import { Neo4jHealthService } from './neo4j-health.service';
import { NeighbourhoodAdminController } from './neighbourhood-admin.controller';
import { NeighbourhoodController } from './neighbourhood.controller';
import { GeoController } from './geo.controller';
import { Neo4jModule } from '../../database/neo4j/neo4j.module';
import { User } from '../users/entities/user.entity';
import { Listing } from '../listings/entities/listing.entity';
import { Evenement } from '../events/entities/evenement.entity';
import { Follow } from '../social/entities/follow.entity';
import { Friendship } from '../social/entities/friendship.entity';
import { UserBlock } from '../social/entities/user-block.entity';

import { HttpRetryModule } from '../../common/http-retry/http-retry.module';

@Module({
  imports: [
    Neo4jModule,
    TypeOrmModule.forFeature([User, Listing, Evenement, Follow, Friendship, UserBlock]),
    HttpRetryModule,
  ],
  controllers: [NeighbourhoodAdminController, NeighbourhoodController, GeoController],
  providers: [
    BanService,
    Neo4jGeoService,
    GeoPipelineProcessor,
    GeoReconciliationService,
    Neo4jHealthService,
  ],
  exports: [
    BanService,
    Neo4jGeoService,
    GeoPipelineProcessor,
    GeoReconciliationService,
    Neo4jHealthService,
  ],
})
export class GeoModule {}
