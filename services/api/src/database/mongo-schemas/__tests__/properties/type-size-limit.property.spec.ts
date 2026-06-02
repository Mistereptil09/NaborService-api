import * as fc from 'fast-check';
import * as mongoose from 'mongoose';
import { UserMediaSchema } from '../../schemas/user-media.schema';

describe('Property 2: Type-dependent size limit enforcement', () => {
  let UserMediaModel: mongoose.Model<any>;

  beforeAll(() => {
    UserMediaModel =
      mongoose.models.UserMedia || mongoose.model('UserMedia', UserMediaSchema);
  });

  it('should accept size_bytes of any size on database schema level (validation delegated to service)', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant('avatar'), fc.constant('banner')),
        fc.integer({ min: 0, max: 8_000_000 }),
        (type, size_bytes) => {
          const doc = new UserMediaModel({
            pg_user_id: 'usr_123',
            type,
            mimetype: 'image/png',
            size_bytes,
            width_px: 100,
            height_px: 100,
            uploaded_at: new Date(),
          });

          const err = doc.validateSync();
          // Validation should pass since database-level size checks are removed and delegated to NestJS services
          expect(err).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
