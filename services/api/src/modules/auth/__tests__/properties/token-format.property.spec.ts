import * as fc from 'fast-check';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../../token.service';
import { User } from '../../../users/entities/user.entity';
import { UserRoleEnum } from '../../../../common/enums';

describe('Property 8: Token format correctness', () => {
  let tokenService: TokenService;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test-secret' });
    tokenService = new TokenService(jwtService, null as any); // Redis client not needed for formatting checks
  });

  it('should verify access_token and refresh_token formats for arbitrary user properties', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          role: fc.constantFrom(
            UserRoleEnum.RESIDENT,
            UserRoleEnum.NEIGHBOURHOOD_REP,
            UserRoleEnum.MODERATOR,
            UserRoleEnum.ADMIN,
          ),
          locale: fc.string({ minLength: 2, maxLength: 5 }),
        }),
        async (userData) => {
          const user = {
            id: userData.id,
            role: userData.role,
            locale: userData.locale,
          } as User;

          const accessToken = tokenService.generateAccessToken(user);
          const decoded = jwtService.decode(accessToken) as any;

          expect(decoded).toBeDefined();
          expect(decoded.sub).toBe(user.id);
          expect(decoded.role).toBe(user.role);
          expect(decoded.locale).toBe(user.locale);
          expect(decoded.exp - decoded.iat).toBe(15 * 60); // exactly 15 minutes TTL

          const refreshToken = tokenService.generateRefreshToken();
          expect(refreshToken).toHaveLength(64);
          expect(refreshToken).toMatch(/^[A-Za-z0-9_-]+$/); // base64url characters only
        },
      ),
      { numRuns: 100 },
    );
  });
});
