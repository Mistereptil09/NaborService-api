import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j from 'neo4j-driver';
import { NEO4J_DRIVER } from './neo4j.constants';
import { Neo4jService } from './neo4j.service';
import { Neo4jInitService } from './neo4j-init.service';
import { Neo4jSyncService } from './neo4j-sync.service';
import { NeighbourhoodService } from './neighbourhood.service';
import { requireEnv, connectWithRetry } from '../database.utils';

const logger = new Logger('Neo4j');

@Global()
@Module({
  providers: [
    {
      provide: NEO4J_DRIVER,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const uri = requireEnv(config, 'NEO4J_URI', 'Neo4j');
        const user = requireEnv(config, 'NEO4J_USER', 'Neo4j');
        const password = requireEnv(config, 'NEO4J_PASSWORD', 'Neo4j');

        const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 10000,
          maxTransactionRetryTime: 15000,
        });

        try {
          await connectWithRetry('Neo4j', () => driver.verifyConnectivity(), {
            maxAttempts: 1,
            delayMs: 0,
          });
        } catch {
          logger.warn(
            'Neo4j is unavailable — graph features disabled. The API will operate normally for non-graph endpoints.',
          );
        }

        return driver;
      },
    },
    Neo4jService,
    Neo4jInitService,
    Neo4jSyncService,
    NeighbourhoodService,
  ],
  exports: [NEO4J_DRIVER, Neo4jService, Neo4jSyncService, NeighbourhoodService],
})
export class Neo4jModule {}
