import { Global, Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Neo4jSyncWorker } from './workers/neo4j-sync.worker';
import { EmailWorker } from './workers/email.worker';
import { StripeWebhookWorker } from './workers/stripe-webhook.worker';
import { EventRegisterWorker } from './workers/event-register.worker';
import { WaitlistPromoteWorker } from './workers/waitlist-promote.worker';
import { RgpdAnonymiseWorker } from './workers/rgpd-anonymise.worker';
import { CryptoRotationWorker } from './workers/crypto-rotation.worker';
import { EventsModule } from '../modules/events/events.module';
import { UsersModule } from '../modules/users/users.module';
import { MongoSchemasModule } from '../database/mongo-schemas/mongo-schemas.module';
import { GeoModule } from '../modules/geo/geo.module';
import { ListingsModule } from '../modules/listings/listings.module';
import { QueueHealthService } from './queue-health.service';
import { QueueHealthController } from './queue-health.controller';
import { QueueFailureListener } from './listeners/queue-failure.listener';
import { Neo4jRecoveryService } from './neo4j-recovery.service';
import { redisRetryStrategy } from './utils/redis-retry';
import { MailModule } from '../mail/mail.module';
import { MessagingModule } from '../modules/messaging/messaging.module';

const queues = [
  'neo4j-sync',
  'email',
  'pdf-generation',
  'stripe-webhook',
  'waitlist-promote',
  'rgpd-anonymise',
  'crypto-rotation',
  'event-register',
  'contract-expiration',
  'call-timeout',
];

// queueProviders removed since BullModule.registerQueue automatically provides the getQueueToken() injection tokens

@Global()
@Module({
  imports: [
    MailModule,
    MessagingModule,
    EventsModule,
    UsersModule,
    MongoSchemasModule,
    GeoModule,
    ListingsModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
          retryStrategy: redisRetryStrategy,
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: 'neo4j-sync',
        defaultJobOptions: { attempts: 10, backoff: { type: 'custom' } },
      },
      {
        name: 'email',
        defaultJobOptions: { attempts: 3, backoff: { type: 'custom' } },
      },
      {
        name: 'pdf-generation',
        defaultJobOptions: { attempts: 3, backoff: { type: 'custom' } },
      },
      {
        name: 'stripe-webhook',
        defaultJobOptions: { attempts: 3, backoff: { type: 'custom' } },
      },
      {
        name: 'waitlist-promote',
        defaultJobOptions: {
          attempts: 3,
          delay: 86400000,
          backoff: { type: 'custom' },
        },
      },
      {
        name: 'rgpd-anonymise',
        defaultJobOptions: {
          attempts: 3,
          priority: 10,
          backoff: { type: 'custom' },
        },
      },
      {
        name: 'crypto-rotation',
        defaultJobOptions: { attempts: 3, backoff: { type: 'custom' } },
      },
      {
        name: 'event-register',
        defaultJobOptions: { attempts: 3, backoff: { type: 'custom' } },
      },
      {
        name: 'contract-expiration',
        defaultJobOptions: { attempts: 3, backoff: { type: 'custom' } },
      },
      {
        name: 'call-timeout',
        defaultJobOptions: { attempts: 3, backoff: { type: 'custom' } },
      },
    ),
  ],
  controllers: [QueueHealthController],
  providers: [
    Neo4jSyncWorker,
    EmailWorker,
    StripeWebhookWorker,
    EventRegisterWorker,
    WaitlistPromoteWorker,
    RgpdAnonymiseWorker,
    CryptoRotationWorker,
    QueueHealthService,
    QueueFailureListener,
    Neo4jRecoveryService,
  ],
  exports: [BullModule],
})
export class QueueModule implements OnModuleInit {
  private readonly logger = new Logger(QueueModule.name);

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const host = this.config.get('REDIS_HOST');
    const port = this.config.get<number>('REDIS_PORT', 6379);
    const password = this.config.get('REDIS_PASSWORD');

    const redis = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      await redis.quit();
    } catch (error) {
      this.logger.error(`Failed to connect to Redis at ${host}:${port}`, error);
    }
  }
}
