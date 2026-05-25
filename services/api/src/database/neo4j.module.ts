import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j from 'neo4j-driver';

export const NEO4J_DRIVER = 'NEO4J_DRIVER';

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
  ],
  exports: [NEO4J_DRIVER],
})
export class Neo4jModule {}
