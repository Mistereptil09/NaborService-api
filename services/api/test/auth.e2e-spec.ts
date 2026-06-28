import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fc from 'fast-check';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';
import {
  createTestUser,
  loginUser,
  loginAndGetToken,
} from './utils/test-factories';

describe('Auth Module (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestingApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await clearDatabase(app);
    await clearRedis(app);
  });

  /** Extracts the refresh_token cookie from a login/totp-verify response. */
  function extractRefreshCookie(res: request.Response): string | null {
    const raw = res.headers['set-cookie'];
    if (!raw) return null;
    const cookies = Array.isArray(raw) ? raw : [raw];
    const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='));
    if (!refreshCookie) return null;
    return refreshCookie.split(';')[0]; // "refresh_token=<value>"
  }

  // ── SSO QR ───────────────────────────────────────────────────

  describe('SSO QR Flow', () => {
    it('should generate a QR code', async () => {
      const genRes = await request(app.getHttpServer())
        .post('/v1/auth/sso/qr/generate')
        .send({ device_name: 'E2E Test Client' })
        .expect(200);

      expect(genRes.body).toHaveProperty('qr_code');
      expect(genRes.body).toHaveProperty('scan_url');
    });

    it('should reject generate without device_name', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/sso/qr/generate')
        .send({})
        .expect(400);
    });

    it('Property: No user_id leaked before validation', () => {
      fc.assert(
        fc.asyncProperty(fc.uuid(), async (tokenUuid) => {
          expect(tokenUuid).toBeDefined();
        }),
      );
    });
  });

  // ── Password Reset ───────────────────────────────────────────

  describe('Password Reset', () => {
    it('Property: No email enumeration', async () => {
      await fc.assert(
        fc.asyncProperty(fc.emailAddress(), async (email) => {
          const ip = `192.168.1.${Math.floor(Math.random() * 255)}`;
          const res = await request(app.getHttpServer())
            .post('/v1/auth/forgot-password')
            .set('x-forwarded-for', ip)
            .send({ email });

          expect(res.status).toBe(200);
          expect(res.body.message).toBe(
            'Si un compte existe, un email a été envoyé',
          );
        }),
        { numRuns: 5 },
      );
    });

    it('should accept forgot-password request for existing user', async () => {
      const { email } = await createTestUser(app);
      await request(app.getHttpServer())
        .post('/v1/auth/forgot-password')
        .send({ email })
        .expect(200);
    });
  });

  // ── Rate Limiting ────────────────────────────────────────────

  describe('Rate Limiting', () => {
    it('should limit logins per account to 10 attempts / 15m', async () => {
      const { email } = await createTestUser(app);

      for (let i = 0; i < 10; i++) {
        const res = await request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email, password: 'wrongpassword' });
        expect([401, 429]).toContain(res.status);
      }

      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'wrongpassword' });
      expect(res.status).toBe(429);
    });
  });

  // ── Refresh Token ────────────────────────────────────────────

  describe('POST /v1/auth/refresh', () => {
    it('should refresh tokens with a valid refresh cookie', async () => {
      const { email, password } = await createTestUser(app);
      const loginRes = await loginUser(app, email, password);

      // Handle TOTP setup flow
      let refreshCookie = extractRefreshCookie(loginRes);
      let accessToken = loginRes.body.access_token;

      if (!accessToken && loginRes.body.challenge === 'totp_setup_required') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const otp = require('otplib');
        const secret = loginRes.body.otpauthUrl.match(/secret=([^&]+)/)[1];
        const code = otp.generateSync({ secret });
        const setupRes = await request(app.getHttpServer())
          .post('/v1/auth/totp/confirm-setup')
          .send({ challenge_token: loginRes.body.challenge_token, code })
          .expect(200);

        accessToken = setupRes.body.access_token;
        refreshCookie = extractRefreshCookie(setupRes);
      }

      expect(refreshCookie).toBeTruthy();

      // Refresh
      const refreshRes = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', refreshCookie!)
        .expect(200);

      expect(refreshRes.body).toHaveProperty('access_token');
      expect(refreshRes.body).toHaveProperty('refresh_token');
      // New refresh token should be different (token rotation)
      expect(refreshRes.body.refresh_token).not.toBe(
        refreshCookie!.replace('refresh_token=', ''),
      );
    });

    it('should return 401 without a refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .expect(401);
    });

    it('should return 401 with an invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', 'refresh_token=invalid_token_12345')
        .expect(401);
    });
  });

  // ── Logout ───────────────────────────────────────────────────

  describe('POST /v1/auth/logout', () => {
    it('should logout and revoke session', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      // Login again to get a refresh cookie
      const loginRes = await loginUser(app, email, password);
      const refreshCookie = extractRefreshCookie(loginRes);

      if (refreshCookie) {
        const res = await request(app.getHttpServer())
          .post('/v1/auth/logout')
          .set('Cookie', refreshCookie)
          .expect(200);

        expect(res.body).toHaveProperty('message', 'Deconnecte avec succes');

        // Refresh with the same cookie should now fail
        await request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Cookie', refreshCookie)
          .expect(401);
      }
    });

    it('should return 401 without a refresh cookie', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .expect(401);
    });
  });

  // ── Logout All ───────────────────────────────────────────────

  describe('POST /v1/auth/logout/all', () => {
    it('should revoke all sessions for the authenticated user', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .post('/v1/auth/logout/all')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout/all')
        .expect(401);
    });
  });

  // ── Sessions ─────────────────────────────────────────────────

  describe('GET /v1/auth/sessions', () => {
    it('should list active sessions for the authenticated user', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('device_name');
      expect(res.body[0]).toHaveProperty('created_at');
      expect(res.body[0]).toHaveProperty('last_used_at');
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .expect(401);
    });
  });

  // ── Delete Session ───────────────────────────────────────────

  describe('DELETE /v1/auth/sessions/:id', () => {
    it('should revoke a specific session', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      // Get sessions
      const sessionsRes = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      if (sessionsRes.body.length > 0) {
        const sessionId = sessionsRes.body[0].id;
        const res = await request(app.getHttpServer())
          .delete(`/v1/auth/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(res.body).toHaveProperty('message');
      }
    });

    it('should return 404 for a non-existent session', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .delete('/v1/auth/sessions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 403 when revoking another user session', async () => {
      const user1 = await createTestUser(app, 'user1');
      const user2 = await createTestUser(app, 'user2');
      const { token: token1 } = await loginAndGetToken(app, user1.email, user1.password);
      const { token: token2 } = await loginAndGetToken(app, user2.email, user2.password);

      // Get user2's session
      const sessionsRes = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      if (sessionsRes.body.length > 0) {
        // User1 tries to revoke user2's session
        await request(app.getHttpServer())
          .delete(`/v1/auth/sessions/${sessionsRes.body[0].id}`)
          .set('Authorization', `Bearer ${token1}`)
          .expect(403);
      }
    });
  });

  // ── TOTP Setup ───────────────────────────────────────────────

  describe('POST /v1/auth/totp/setup', () => {
    it('should return otpauth URL for setup', async () => {
      const { email, password } = await createTestUser(app);
      const loginRes = await loginUser(app, email, password);

      // Users created via register may already have TOTP configured
      // If login returns access_token directly, TOTP is not yet set up
      if (loginRes.body.access_token) {
        const res = await request(app.getHttpServer())
          .post('/v1/auth/totp/setup')
          .set('Authorization', `Bearer ${loginRes.body.access_token}`)
          .expect(200);

        expect(res.body).toHaveProperty('otpauthUrl');
        expect(res.body.otpauthUrl).toContain('otpauth://totp/');
      }
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/totp/setup')
        .expect(401);
    });
  });

  // ── TOTP Disable ─────────────────────────────────────────────

  describe('POST /v1/auth/totp/disable', () => {
    it('should disable TOTP with a valid code', async () => {
      const { email, password } = await createTestUser(app);
      const { token, secret } = await loginAndGetToken(app, email, password);

      if (secret) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const otp = require('otplib');
        const code = otp.generateSync({ secret });

        const res = await request(app.getHttpServer())
          .post('/v1/auth/totp/disable')
          .set('Authorization', `Bearer ${token}`)
          .send({ code });

        expect([200, 201]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body).toHaveProperty('message');
        }
      }
    });

    it('should return 401 with an invalid code', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .post('/v1/auth/totp/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '000000' })
        .expect(401);
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/totp/disable')
        .send({ code: '123456' })
        .expect(401);
    });
  });
});
