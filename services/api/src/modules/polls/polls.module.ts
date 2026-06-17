import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Poll } from './entities/poll.entity';
import { PollOption } from './entities/poll-option.entity';
import { Vote } from './entities/vote.entity';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';
import { PollsGateway } from './polls.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Poll, PollOption, Vote]), AuthModule],
  controllers: [PollsController],
  providers: [PollsService, PollsGateway],
  exports: [PollsService, PollsGateway],
})
export class PollsModule {}
