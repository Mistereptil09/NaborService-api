import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModuleAsyncOptions } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { requireEnv, connectWithRetry } from './database.utils';

export const mongoConfig: MongooseModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const host = requireEnv(config, 'MONGO_HOST', 'MongoDB');
    const port = config.get<string>('MONGO_PORT') || '27017';
    const username = requireEnv(config, 'MONGO_INITDB_ROOT_USERNAME', 'MongoDB');
    const password = requireEnv(config, 'MONGO_INITDB_ROOT_PASSWORD', 'MongoDB');
    const database = config.get<string>('MONGO_DB') || 'nabor_db';

    const uri = `mongodb://${username}:${password}@${host}:${port}/${database}?authSource=admin`;

    // Verify connectivity using our shared retry wrapper
    await connectWithRetry('MongoDB', async () => {
      const conn = await mongoose.createConnection(uri).asPromise();
      await conn.close();
    });

    return { uri };
  },
};
