import { Inject, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Driver } from 'neo4j-driver';
import { NEO4J_DRIVER, INDEX_EXISTS_CODE } from './neo4j.constants';
import { Neo4jService } from './neo4j.service';

interface IndexDef {
  name: string;
  label: string;
  properties: string[];
  type: 'RANGE' | 'POINT';
}

const INDEX_DEFINITIONS: IndexDef[] = [
  // RANGE indexes
  { name: 'user_pg_id', label: 'User', properties: ['pg_id'], type: 'RANGE' },
  {
    name: 'listing_pg_id',
    label: 'Listing',
    properties: ['pg_id'],
    type: 'RANGE',
  },
  { name: 'event_pg_id', label: 'Event', properties: ['pg_id'], type: 'RANGE' },
  {
    name: 'neighbourhood_id',
    label: 'Neighbourhood',
    properties: ['pg_id'],
    type: 'RANGE',
  },
  {
    name: 'neighbourhood_city',
    label: 'Neighbourhood',
    properties: ['city'],
    type: 'RANGE',
  },
  {
    name: 'category_pg_id',
    label: 'Category',
    properties: ['pg_id'],
    type: 'RANGE',
  },
  {
    name: 'listing_status_date',
    label: 'Listing',
    properties: ['status', 'created_at'],
    type: 'RANGE',
  },
  {
    name: 'event_status_date',
    label: 'Event',
    properties: ['status', 'starts_at'],
    type: 'RANGE',
  },
  {
    name: 'user_visibility',
    label: 'User',
    properties: ['visibility'],
    type: 'RANGE',
  },
  // POINT index
  {
    name: 'neighbourhood_centroid',
    label: 'Neighbourhood',
    properties: ['centroid'],
    type: 'POINT',
  },
];

@Injectable()
export class Neo4jInitService implements OnModuleInit {
  private readonly logger = new Logger(Neo4jInitService.name);

  constructor(
    @Inject(NEO4J_DRIVER)
    private readonly driver: Driver,
    private readonly neo4jService: Neo4jService,
  ) {}

  async onModuleInit() {
    // Fail fast if Neo4j is unreachable
    try {
      await this.driver.verifyConnectivity();
    } catch (err) {
      this.logger.error('Neo4j connection failed during verification');
      throw new Error('Neo4j connection failed during initialization');
    }

    let created = 0;
    let skipped = 0;

    for (const def of INDEX_DEFINITIONS) {
      const propertiesStr = def.properties.map((p) => `n.${p}`).join(', ');
      const cypher = `CREATE ${def.type} INDEX ${def.name} IF NOT EXISTS FOR (n:${def.label}) ON (${propertiesStr})`;

      try {
        await this.neo4jService.run(cypher);
        created++;
      } catch (err: any) {
        if (err && err.code === INDEX_EXISTS_CODE) {
          skipped++;
        } else {
          this.logger.error(
            `Failed to create index ${def.name}: ${err.message || err}`,
          );
          throw err; // throw to fail startup
        }
      }
    }

    this.logger.log(`Neo4j indexes: ${created} created, ${skipped} skipped`);
  }
}
