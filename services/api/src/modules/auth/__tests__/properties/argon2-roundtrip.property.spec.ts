import * as fc from 'fast-check';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

describe('Property 14: Argon2id hash round-trip', () => {
  it('should correctly hash and verify passwords of arbitrary formats', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 128 }),
        async (password) => {
          const salt = crypto.randomBytes(16);
          const hash = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 16384,
            timeCost: 2,
            parallelism: 1,
            hashLength: 32,
            salt,
          });

          // Verify correct password
          const isOriginalValid = await argon2.verify(hash, password);
          expect(isOriginalValid).toBe(true);

          // Verify incorrect password fails
          const isDifferentValid = await argon2.verify(
            hash,
            password + '_modified',
          );
          expect(isDifferentValid).toBe(false);
        },
      ),
      { numRuns: 30 },
    );
  }, 30000); // 30 seconds timeout
});
