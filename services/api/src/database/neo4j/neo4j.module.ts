import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j from 'neo4j-driver';
import { NEO4J_DRIVER } from './neo4j.constants';
import { Neo4jService } from './neo4j.service';
import { Neo4jInitService } from './neo4j-init.service';
import { Neo4jSyncService } from './neo4j-sync.service';
import { NeighbourhoodService } from './neighbourhood.service';

@Global()
@Module({
  providers: [
    {
      provide: NEO4J_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        neo4j.driver(
          config.get<string>('NEO4J_URI')!,
          neo4j.auth.basic(
            config.get<string>('NEO4J_USER')!,
            config.get<string>('NEO4J_PASSWORD')!,
          ),
        ),
    },
    Neo4jService,
    Neo4jInitService,
    Neo4jSyncService,
    NeighbourhoodService,
  ],
  exports: [NEO4J_DRIVER, Neo4jService, Neo4jSyncService, NeighbourhoodService],
})
export class Neo4jModule {}
