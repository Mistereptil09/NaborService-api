import * as mongoose from 'mongoose';
import { UserMediaSchema } from '../schemas/user-media.schema';

describe('UserMedia Schema', () => {
  let UserMediaModel: mongoose.Model<any>;

  beforeAll(() => {
    UserMediaModel =
      mongoose.models.UserMedia || mongoose.model('UserMedia', UserMediaSchema);
  });

  it('should have the correct collection name', () => {
    expect(UserMediaSchema.options.collection).toBe('user_media');
  });

  it('should have the correct indexes defined', () => {
    const indexes = UserMediaSchema.indexes();

    const compoundIdx = indexes.find(
      (idx) => idx[0].pg_user_id === 1 && idx[0].type === 1,
    );
    expect(compoundIdx).toBeDefined();
    expect(compoundIdx?.[1]?.unique).toBe(true);

    const uploadedIdx = indexes.find((idx) => idx[0].uploaded_at === -1);
    expect(uploadedIdx).toBeDefined();
  });

  it('should validate successfully for a valid avatar', () => {
    const doc = new UserMediaModel({
      pg_user_id: 'usr_123',
      type: 'avatar',
      mimetype: 'image/png',
      size_bytes: 2097152,
      width_px: 500,
      height_px: 500,
      uploaded_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('should validate successfully for a valid banner', () => {
    const doc = new UserMediaModel({
      pg_user_id: 'usr_123',
      type: 'banner',
      mimetype: 'image/png',
      size_bytes: 4194304,
      width_px: 1200,
      height_px: 400,
      uploaded_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('should reject invalid types', () => {
    const doc = new UserMediaModel({
      pg_user_id: 'usr_123',
      type: 'invalid_type',
      mimetype: 'image/png',
      size_bytes: 100,
      width_px: 50,
      height_px: 50,
      uploaded_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.type).toBeDefined();
  });

  it('should require all non-optional fields', () => {
    const doc = new UserMediaModel({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.pg_user_id).toBeDefined();
    expect(err?.errors.type).toBeDefined();
    expect(err?.errors.mimetype).toBeDefined();
    expect(err?.errors.size_bytes).toBeDefined();
    expect(err?.errors.width_px).toBeDefined();
    expect(err?.errors.height_px).toBeDefined();
    expect(err?.errors.uploaded_at).toBeDefined();
  });
});
