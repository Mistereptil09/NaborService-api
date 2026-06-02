import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ListingCategory } from './entities/listing-category.entity';
import { Listing } from './entities/listing.entity';
import { ListingTransaction } from './entities/listing-transaction.entity';
import { ListingReport } from './entities/listing-report.entity';
import { ListingModerationAction } from './entities/listing-moderation-action.entity';
import { ChatGroup } from '../messaging/entities/chat-group.entity';
import { User } from '../users/entities/user.entity';
import { UserBlock } from '../social/entities/user-block.entity';

import {
  ListingDocument,
  ListingDocumentSchema,
} from '../../database/mongo-schemas/schemas/listing-document.schema';
import {
  Contract,
  ContractSchema,
} from '../../database/mongo-schemas/schemas/contract.schema';

import { ListingsService } from './listings.service';
import { ListingContentService } from './listing-content.service';
import { ListingMediaService } from './listing-media.service';
import { ListingStateMachineService } from './listing-state-machine.service';
import { ListingTransactionService } from './listing-transaction.service';
import { ListingReportService } from './listing-report.service';
import { ListingModerationService } from './listing-moderation.service';
import { ListingSignatureService } from './listing-signature.service';
import { ListingsGateway } from './listings.gateway';
import { ListingsController } from './listings.controller';

import { PdfGenerationWorker } from './workers/pdf-generation.worker';
import { ContractExpirationWorker } from './workers/contract-expiration.worker';

import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ListingCategory,
      Listing,
      ListingTransaction,
      ListingReport,
      ListingModerationAction,
      ChatGroup,
      User,
      UserBlock,
    ]),
    MongooseModule.forFeature([
      { name: ListingDocument.name, schema: ListingDocumentSchema },
      { name: Contract.name, schema: ContractSchema },
    ]),
    AuthModule,
    MediaModule,
  ],
  controllers: [ListingsController],
  providers: [
    ListingsService,
    ListingContentService,
    ListingMediaService,
    ListingStateMachineService,
    ListingTransactionService,
    ListingReportService,
    ListingModerationService,
    ListingSignatureService,
    ListingsGateway,
    PdfGenerationWorker,
    ContractExpirationWorker,
  ],
  exports: [
    ListingsService,
    ListingContentService,
    ListingMediaService,
    ListingStateMachineService,
    ListingTransactionService,
    ListingReportService,
    ListingModerationService,
    ListingSignatureService,
  ],
})
export class ListingsModule {}
