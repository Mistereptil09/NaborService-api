import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserMedia, UserMediaSchema } from './schemas/user-media.schema';
import { ListingDocument, ListingDocumentSchema } from './schemas/listing-document.schema';
import { Contract, ContractSchema } from './schemas/contract.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { EventDocument, EventDocumentSchema } from './schemas/event-document.schema';
import { EventTicket, EventTicketSchema } from './schemas/event-ticket.schema';
import { IncidentDocument, IncidentDocumentSchema } from './schemas/incident-document.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserMedia.name, schema: UserMediaSchema },
      { name: ListingDocument.name, schema: ListingDocumentSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: Message.name, schema: MessageSchema },
      { name: EventDocument.name, schema: EventDocumentSchema },
      { name: EventTicket.name, schema: EventTicketSchema },
      { name: IncidentDocument.name, schema: IncidentDocumentSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class MongoSchemasModule {}
