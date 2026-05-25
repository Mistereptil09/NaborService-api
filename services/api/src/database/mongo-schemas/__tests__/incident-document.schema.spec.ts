import * as mongoose from 'mongoose';
import { IncidentDocumentSchema } from '../schemas/incident-document.schema';

describe('IncidentDocument Schema', () => {
  let IncidentDocumentModel: mongoose.Model<any>;

  beforeAll(() => {
    IncidentDocumentModel =
      mongoose.models.IncidentDocument || mongoose.model('IncidentDocument', IncidentDocumentSchema);
  });

  it('should have the correct collection name', () => {
    expect(IncidentDocumentSchema.options.collection).toBe('incident_documents');
  });

  it('should have the correct indexes defined', () => {
    const indexes = IncidentDocumentSchema.indexes();

    const pgIncidentIdx = indexes.find(idx => idx[0].pg_incident_id === 1);
    expect(pgIncidentIdx).toBeDefined();
    expect(pgIncidentIdx?.[1]?.unique).toBe(true);

    const syncedIdx = indexes.find(idx => idx[0].synced_at === -1);
    expect(syncedIdx).toBeDefined();

    const updatedIdx = indexes.find(idx => idx[0].updated_at === -1);
    expect(updatedIdx).toBeDefined();
  });

  it('should validate successfully for a valid incident document', () => {
    const doc = new IncidentDocumentModel({
      pg_incident_id: 'inc_123',
      body: 'Offline incident report',
      photos: [
        {
          data: Buffer.from('photo data'),
          mimetype: 'image/png',
          size_bytes: 50000,
          taken_at: new Date(),
          synced_at: new Date(),
        },
      ],
      location_hint: 'Near the central park entrance',
      created_at: new Date(),
      updated_at: new Date(),
      synced_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('should require all non-optional fields', () => {
    const doc = new IncidentDocumentModel({
      pg_incident_id: 'inc_123',
      // missing body, created_at, updated_at, synced_at
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.body).toBeDefined();
    expect(err?.errors.created_at).toBeDefined();
    expect(err?.errors.updated_at).toBeDefined();
    expect(err?.errors.synced_at).toBeDefined();
  });
});
