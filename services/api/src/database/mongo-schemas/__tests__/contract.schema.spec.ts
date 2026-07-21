import * as mongoose from 'mongoose';
import { ContractSchema } from '../schemas/contract.schema';

describe('Contract Schema', () => {
  let ContractModel: mongoose.Model<any>;

  beforeAll(() => {
    ContractModel =
      mongoose.models.Contract || mongoose.model('Contract', ContractSchema);
  });

  it('should have the correct collection name', () => {
    expect(ContractSchema.options.collection).toBe('contracts');
  });

  it('should have the correct indexes defined', () => {
    const indexes = ContractSchema.indexes();

    const pgTxIdx = indexes.find((idx) => idx[0].pg_transaction_id === 1);
    expect(pgTxIdx).toBeDefined();
    expect(pgTxIdx?.[1]?.unique).toBe(true);

    const shaIdx = indexes.find((idx) => idx[0].sha256_hash === 1);
    expect(shaIdx).toBeDefined();
    expect(shaIdx?.[1]?.unique).toBe(true);

    const signedIdx = indexes.find((idx) => idx[0].signed_at === -1);
    expect(signedIdx).toBeDefined();

    const anonymisedIdx = indexes.find((idx) => idx[0].anonymised_at === 1);
    expect(anonymisedIdx).toBeDefined();
  });

  it('should validate successfully for a valid contract', () => {
    const doc = new ContractModel({
      pg_transaction_id: 'tx_123',
      type: 'contract',
      sha256_hash: 'abc123hash',
      pdf: {
        gridfs_file_id: 'test-gridfs-id',
        mimetype: 'application/pdf',
        size_bytes: 50000,
      },
      parties: {
        provider: {
          pg_user_id: 'usr_provider',
          full_name: 'Jane Doe',
          email: 'jane@example.com',
        },
        requester: {
          pg_user_id: 'usr_requester',
          full_name: 'John Doe',
          email: 'john@example.com',
        },
      },
      listing_snapshot: {
        title: 'Lawn Mowing',
        price_cents: 2500,
        listing_type: 'offer',
        neighbourhood_name: 'Green Hills',
      },
      signatures: {
        provider: {
          canvas_b64: 'base64sig',
          totp_verified_at: new Date(),
          signed_ip: '192.168.1.1',
          user_agent: 'Chrome',
          signed_at: new Date(),
        },
        requester: null,
      },
      signed_at: new Date(),
      created_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('should require all non-optional subdocument fields', () => {
    const doc = new ContractModel({
      pg_transaction_id: 'tx_123',
      type: 'contract',
      sha256_hash: 'abc123hash',
      // missing pdf, parties, listing_snapshot
      created_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.pdf).toBeDefined();
    expect(err?.errors.parties).toBeDefined();
    expect(err?.errors.listing_snapshot).toBeDefined();
  });

  it('should default signatures to unsigned when omitted', () => {
    const doc = new ContractModel({
      pg_transaction_id: 'tx_123',
      type: 'contract',
      sha256_hash: 'abc123hash',
      pdf: {
        gridfs_file_id: 'test-gridfs-id',
        mimetype: 'application/pdf',
        size_bytes: 50000,
      },
      parties: {
        provider: {
          pg_user_id: 'usr_provider',
          full_name: 'Jane Doe',
          email: 'jane@example.com',
        },
        requester: {
          pg_user_id: 'usr_requester',
          full_name: 'John Doe',
          email: 'john@example.com',
        },
      },
      listing_snapshot: {
        title: 'Lawn Mowing',
        price_cents: 2500,
        listing_type: 'offer',
        neighbourhood_name: 'Green Hills',
      },
      created_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.signatures.provider).toBeNull();
    expect(doc.signatures.requester).toBeNull();
  });

  it('should reject invalid types and enums', () => {
    const doc = new ContractModel({
      pg_transaction_id: 'tx_123',
      type: 'invalid_type', // enum error
      sha256_hash: 'abc123hash',
      pdf: {
        gridfs_file_id: 'test-gridfs-id',
        mimetype: 'application/pdf',
        size_bytes: 50000,
      },
      parties: {
        provider: {
          pg_user_id: 'usr_provider',
          full_name: 'Jane Doe',
          email: 'jane@example.com',
        },
        requester: {
          pg_user_id: 'usr_requester',
          full_name: 'John Doe',
          email: 'john@example.com',
        },
      },
      listing_snapshot: {
        title: 'Lawn Mowing',
        price_cents: 2500,
        listing_type: 'invalid_listing_type', // enum error
        neighbourhood_name: 'Green Hills',
      },
      created_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.type).toBeDefined();
    expect(err?.errors['listing_snapshot.listing_type']).toBeDefined();
  });
});
