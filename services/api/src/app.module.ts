import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { postgresConfig } from './database/postgres.config';
import { Neo4jModule } from './database/neo4j.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync(postgresConfig),
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
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongoSchemasModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
