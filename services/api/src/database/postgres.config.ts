import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { requireEnv, connectWithRetry } from './database.utils';

export const postgresConfig: TypeOrmModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const host = requireEnv(config, 'POSTGRES_HOST', 'PostgreSQL');
    const port = parseInt(config.get<string>('POSTGRES_PORT') || '5432', 10);
    const username = requireEnv(config, 'POSTGRES_USER', 'PostgreSQL');
    const password = requireEnv(config, 'POSTGRES_PASSWORD', 'PostgreSQL');
    const database = requireEnv(config, 'POSTGRES_DB', 'PostgreSQL');

    return {
      type: 'postgres' as const,
      host,
      port,
      username,
      password,
      database,
      autoLoadEntities: true,
      synchronize: config.get<string>('NODE_ENV') !== 'production',
      // TypeORM-level pool: max concurrent connections across all queries.
      // Default is 10 — increase to avoid connection reuse under load.
      poolSize: 20,
      extra: {
        // pg Pool options passed through to the underlying driver.
        // idleTimeoutMillis cleans up stale connections after 30s idle.
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      },
    };
  },
  dataSourceFactory: async (options) => {
    return connectWithRetry('PostgreSQL', () =>
      new DataSource(options!).initialize(),
    );
  },
};
