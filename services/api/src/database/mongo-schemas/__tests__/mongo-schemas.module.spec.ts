import { Test, TestingModule } from '@nestjs/testing';
import { MongoSchemasModule } from '../mongo-schemas.module';
import { getModelToken } from '@nestjs/mongoose';
import { UserMedia } from '../schemas/user-media.schema';
import { ListingDocument } from '../schemas/listing-document.schema';
import { Contract } from '../schemas/contract.schema';
import { Message } from '../schemas/message.schema';
import { EventDocument } from '../schemas/event-document.schema';
import { EventTicket } from '../schemas/event-ticket.schema';
import { IncidentDocument } from '../schemas/incident-document.schema';

describe('MongoSchemasModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [MongoSchemasModule],
    })
      .overrideProvider(getModelToken(UserMedia.name))
      .useValue({})
      .overrideProvider(getModelToken(ListingDocument.name))
      .useValue({})
      .overrideProvider(getModelToken(Contract.name))
      .useValue({})
      .overrideProvider(getModelToken(Message.name))
      .useValue({})
      .overrideProvider(getModelToken(EventDocument.name))
      .useValue({})
      .overrideProvider(getModelToken(EventTicket.name))
      .useValue({})
      .overrideProvider(getModelToken(IncidentDocument.name))
      .useValue({})
      .compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
    expect(module.get(MongoSchemasModule)).toBeDefined();
  });

  it('should have all 7 models registered and injectable', () => {
    expect(module.get(getModelToken(UserMedia.name))).toBeDefined();
    expect(module.get(getModelToken(ListingDocument.name))).toBeDefined();
    expect(module.get(getModelToken(Contract.name))).toBeDefined();
    expect(module.get(getModelToken(Message.name))).toBeDefined();
    expect(module.get(getModelToken(EventDocument.name))).toBeDefined();
    expect(module.get(getModelToken(EventTicket.name))).toBeDefined();
    expect(module.get(getModelToken(IncidentDocument.name))).toBeDefined();
  });
});
