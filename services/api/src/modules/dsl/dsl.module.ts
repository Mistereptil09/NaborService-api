import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DslController } from './dsl.controller';
import { DslService } from './dsl.service';
import { DslQuery } from './dsl-query.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DslQuery])],
  controllers: [DslController],
  providers: [DslService],
  exports: [DslService],
})
export class DslModule {}
