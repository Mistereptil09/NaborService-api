import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CallLog } from './entities/call-log.entity';
import { CallLogParticipant } from './entities/call-log-participant.entity';
import { CallsService } from './calls.service';
import { CallsGateway } from './calls.gateway';
import { CallsController } from './calls.controller';
import { CallTimeoutWorker } from './workers/call-timeout.worker';
import { AuthModule } from '../auth/auth.module';
import { MessagingModule } from '../messaging/messaging.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CallLog, CallLogParticipant]),
    AuthModule,
    MessagingModule,
    UsersModule,
  ],
  controllers: [CallsController],
  providers: [CallsService, CallsGateway, CallTimeoutWorker],
  exports: [CallsService],
})
export class CallsModule {}
