import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { DslController } from './dsl.controller';
import { DslService } from './dsl.service';
import { DslQuery } from './dsl-query.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DslQuery]), MongooseModule],
  controllers: [DslController],
  providers: [DslService],
  exports: [DslService],
})
export class DslModule {}
