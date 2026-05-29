import { Global, Module } from '@nestjs/common';
import { HttpRetryService } from './http-retry.service';

@Global()
@Module({
  providers: [HttpRetryService],
  exports: [HttpRetryService],
})
export class HttpRetryModule {}
