import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListingCategory } from './entities/listing-category.entity';
import { Listing } from './entities/listing.entity';
import { ListingTransaction } from './entities/listing-transaction.entity';
import { ListingReport } from './entities/listing-report.entity';
import { ListingModerationAction } from './entities/listing-moderation-action.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ListingCategory,
      Listing,
      ListingTransaction,
      ListingReport,
      ListingModerationAction,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class ListingsModule {}
