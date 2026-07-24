import { Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModuleAsyncOptions } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { requireEnv } from './database.utils';

const logger = new Logger('MongoDB');

export const mongoConfig: MongooseModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const host = requireEnv(config, 'MONGO_HOST', 'MongoDB');
    const port = config.get<string>('MONGO_PORT') || '27017';
    const username = requireEnv(
      config,
      'MONGO_INITDB_ROOT_USERNAME',
      'MongoDB',
    );
    const password = requireEnv(
      config,
      'MONGO_INITDB_ROOT_PASSWORD',
      'MongoDB',
    );
    const database = config.get<string>('MONGO_DB') || 'nabor_db';

    const uri = `mongodb://${username}:${password}@${host}:${port}/${database}?authSource=admin`;

    try {
      const conn = await mongoose.createConnection(uri).asPromise();
      await conn.close();
      logger.log('Connected successfully.');
    } catch (err) {
      logger.warn(
        `MongoDB unavailable at startup: ${(err as Error).message}. ` +
          'Server will start without it — features requiring MongoDB (media, chat, contracts) will be unavailable until it recovers.',
      );
    }

    return {
      uri,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    };
  },
};
