import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointsLedgerEntry } from './entities/points-ledger-entry.entity';
import { PointsTopup } from './entities/points-topup.entity';
import { PointsCashout } from './entities/points-cashout.entity';
import { User } from '../users/entities/user.entity';
import { PointsService } from './points.service';
import { PointsTopupService } from './points-topup.service';
import { PointsConnectService } from './points-connect.service';
import { PointsCashoutService } from './points-cashout.service';
import { PointsController } from './points.controller';
import { AdminModule } from '../admin/admin.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PointsLedgerEntry, PointsTopup, PointsCashout, User]),
    forwardRef(() => AdminModule),
    StripeModule,
  ],
  controllers: [PointsController],
  providers: [PointsService, PointsTopupService, PointsConnectService, PointsCashoutService],
  exports: [PointsService, PointsTopupService, PointsConnectService, PointsCashoutService],
})
export class PointsModule {}
