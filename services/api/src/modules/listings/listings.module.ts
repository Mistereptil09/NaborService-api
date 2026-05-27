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

import { ListingDocument, ListingDocumentSchema } from '../../database/mongo-schemas/schemas/listing-document.schema';
import { Contract, ContractSchema } from '../../database/mongo-schemas/schemas/contract.schema';

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

const mockQueue = {
  add: async (name: string, data: any, options?: any) => {
    console.log(`[Mock Queue Job added] name: ${name}, data:`, data, 'options:', options);
    return { id: `mock-job-${Date.now()}` };
  },
};

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
    ]),
    MongooseModule.forFeature([
      { name: ListingDocument.name, schema: ListingDocumentSchema },
      { name: Contract.name, schema: ContractSchema },
    ]),
    AuthModule,
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
    {
      provide: 'BullQueue_neo4j-sync',
      useValue: mockQueue,
    },
    {
      provide: 'BullQueue_pdf-generation',
      useValue: mockQueue,
    },
    {
      provide: 'BullQueue_contract-expiration',
      useValue: mockQueue,
    },
    {
      provide: 'BullQueue_email',
      useValue: mockQueue,
    },
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
