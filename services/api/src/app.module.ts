import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { postgresConfig } from './database/postgres.config';
import { mongoConfig } from './database/mongo.config';
import { Neo4jModule } from './database/neo4j';
import { RedisModule } from './database/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SocialModule } from './modules/social/social.module';
import { ListingsModule } from './modules/listings/listings.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { EventsModule } from './modules/events/events.module';
import { PollsModule } from './modules/polls/polls.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { MongoSchemasModule } from './database/mongo-schemas';
import { MediaModule } from './modules/media/media.module';
import { SyncModule } from './modules/sync/sync.module';
import { GeoModule } from './modules/geo/geo.module';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from './queue/queue.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { I18nModule } from './modules/i18n/i18n.module';

@Module({
  imports: [
    QueueModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.e2e.env' : '.env',
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync(postgresConfig),
    MongooseModule.forRootAsync(mongoConfig),
    RedisModule,
    Neo4jModule,
    AuthModule,
    UsersModule,
    SocialModule,
    ListingsModule,
    MessagingModule,
    EventsModule,
    PollsModule,
    IncidentsModule,
    MediaModule,
    MongoSchemasModule,
    SyncModule,
    GeoModule,
    AdminModule,
    HealthModule,
    I18nModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
