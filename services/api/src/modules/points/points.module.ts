import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointsLedgerEntry } from './entities/points-ledger-entry.entity';
import { PointsTopup } from './entities/points-topup.entity';
import { User } from '../users/entities/user.entity';
import { PointsService } from './points.service';
import { PointsTopupService } from './points-topup.service';
import { PointsController } from './points.controller';
import { AdminModule } from '../admin/admin.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PointsLedgerEntry, PointsTopup, User]),
    AdminModule,
    StripeModule,
  ],
  controllers: [PointsController],
  providers: [PointsService, PointsTopupService],
  exports: [PointsService, PointsTopupService],
})
export class PointsModule {}
