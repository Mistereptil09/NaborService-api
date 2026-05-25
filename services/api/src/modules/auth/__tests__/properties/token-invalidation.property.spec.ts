import * as fc from 'fast-check';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../../strategies/jwt.strategy';
import { User } from '../../../users/entities/user.entity';
import { JwtPayload } from '../../interfaces/auth.interfaces';

describe('Property 9: Token invalidation after password change or account deletion', () => {
  let strategy: JwtStrategy;
  let mockUserRepo: any;

  beforeEach(() => {
    mockUserRepo = {
      findOne: jest.fn(),
    };
    const mockConfig = {
      get: jest.fn().mockReturnValue('test-secret'),
    };
    strategy = new JwtStrategy(mockConfig as any, mockUserRepo);
  });

  it('should invalidate token if password_changed_at > iat OR deleted_at is not null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          iat: fc.integer({ min: 1000000000, max: 2000000000 }), // token iat (in seconds since epoch)
          passwordChangedOffset: fc.integer({ min: -10000000, max: 10000000 }), // offset in ms relative to iat
          isDeleted: fc.boolean(),
        }),
        async (data) => {
          const tokenIat = data.iat;
          const passwordChangedAt = new Date((tokenIat * 1000) + data.passwordChangedOffset);
          const deletedAt = data.isDeleted ? new Date() : null;

          const user = {
            id: 'user-id',
            role: 'resident',
            locale: 'fr',
            passwordChangedAt,
            deletedAt,
          } as User;

          mockUserRepo.findOne.mockResolvedValueOnce(user);

          const payload: JwtPayload = {
            sub: 'user-id',
            role: 'resident' as any,
            locale: 'fr',
            iat: tokenIat,
            exp: tokenIat + 900,
          };

          const expectFailure = data.isDeleted || data.passwordChangedOffset > 0;

          if (expectFailure) {
            await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
          } else {
            const result = await strategy.validate(payload);
            expect(result).toBeDefined();
            expect(result.sub).toBe(user.id);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
