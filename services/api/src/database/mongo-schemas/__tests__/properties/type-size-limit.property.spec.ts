import * as fc from 'fast-check';
import * as mongoose from 'mongoose';
import { UserMediaSchema } from '../../schemas/user-media.schema';

describe('Property 2: Type-dependent size limit enforcement', () => {
  let UserMediaModel: mongoose.Model<any>;

  beforeAll(() => {
    UserMediaModel = mongoose.models.UserMedia || mongoose.model('UserMedia', UserMediaSchema);
  });

  it('should accept size_bytes within limits and reject above limits', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant('avatar'), fc.constant('banner')),
        fc.integer({ min: 0, max: 8_000_000 }),
        (type, size_bytes) => {
          const doc = new UserMediaModel({
            pg_user_id: 'usr_123',
            type,
            data: Buffer.from('test'),
            mimetype: 'image/png',
            size_bytes,
            width_px: 100,
            height_px: 100,
            uploaded_at: new Date(),
          });

          const err = doc.validateSync();
          const limit = type === 'avatar' ? 2097152 : 4194304;

          if (size_bytes <= limit) {
            // Mongoose validation should pass
            expect(err).toBeUndefined();
          } else {
            // Mongoose validation should fail on size_bytes
            expect(err).toBeDefined();
            expect(err?.errors.size_bytes).toBeDefined();
            expect(err?.errors.size_bytes.message).toContain(
              `size_bytes exceeds maximum of ${limit} bytes for ${type}`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
