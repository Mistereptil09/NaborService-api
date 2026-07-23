import { Module } from '@nestjs/common';
import { HttpRetryModule } from '../../common/http-retry/http-retry.module';
import { UpdatesController } from './updates.controller';
import { UpdatesService } from './updates.service';

@Module({
  imports: [HttpRetryModule],
  controllers: [UpdatesController],
  providers: [UpdatesService],
})
export class UpdatesModule {}
