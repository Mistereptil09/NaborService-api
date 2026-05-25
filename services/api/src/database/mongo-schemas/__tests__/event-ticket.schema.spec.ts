import * as mongoose from 'mongoose';
import { EventTicketSchema } from '../schemas/event-ticket.schema';

describe('EventTicket Schema', () => {
  let EventTicketModel: mongoose.Model<any>;

  beforeAll(() => {
    EventTicketModel = mongoose.models.EventTicket || mongoose.model('EventTicket', EventTicketSchema);
  });

  it('should have the correct collection name', () => {
    expect(EventTicketSchema.options.collection).toBe('event_tickets');
  });

  it('should have the correct indexes defined', () => {
    const indexes = EventTicketSchema.indexes();

    const compoundIdx = indexes.find(idx => idx[0].pg_event_id === 1 && idx[0].pg_user_id === 1);
    expect(compoundIdx).toBeDefined();
    expect(compoundIdx?.[1]?.unique).toBe(true);

    const hmacIdx = indexes.find(idx => idx[0]['qr_payload.hmac_sha256'] === 1);
    expect(hmacIdx).toBeDefined();
    expect(hmacIdx?.[1]?.unique).toBe(true);

    const issuedIdx = indexes.find(idx => idx[0].issued_at === -1);
    expect(issuedIdx).toBeDefined();
  });

  it('should validate successfully for a valid event ticket', () => {
    const doc = new EventTicketModel({
      pg_event_id: 'evt_123',
      pg_user_id: 'usr_buyer',
      qr_payload: {
        event_id: 'evt_123',
        user_id: 'usr_buyer',
        first_name: 'John',
        custom_value: 'premium_seat',
        hmac_sha256: 'hmachash123',
      },
      qr_png: Buffer.from('png data'),
      issued_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('should require all non-optional fields', () => {
    const doc = new EventTicketModel({
      pg_event_id: 'evt_123',
      // missing pg_user_id, qr_payload, qr_png, issued_at
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.pg_user_id).toBeDefined();
    expect(err?.errors.qr_payload).toBeDefined();
    expect(err?.errors.qr_png).toBeDefined();
    expect(err?.errors.issued_at).toBeDefined();
  });
});
