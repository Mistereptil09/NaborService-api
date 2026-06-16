import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestingApp,
  clearDatabase,
  clearRedis,
  clearQueues,
} from './utils/e2e-setup';
import {
  createTestUser,
  loginAndGetToken,
} from './utils/test-factories';

describe('Users & Social Modules (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestingApp();
  });

  afterAll(async () => {
    if (app) {
      await clearQueues(app);
      await app.close();
    }
  });

  beforeEach(async () => {
    await clearDatabase(app);
    await clearRedis(app);
  });

  // ── Preferences and Security ────────────────────────────────

  describe('Users Controller - Preferences and Security', () => {
    it('should get and update locale', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      // GET locale
      const getRes = await request(app.getHttpServer())
        .get('/v1/users/me/locale')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(getRes.body.locale).toBe('fr'); // Default is 'fr' according to entity

      // PATCH locale
      const patchRes = await request(app.getHttpServer())
        .patch('/v1/users/me/locale')
        .set('Authorization', `Bearer ${token}`)
        .send({ locale: 'en' })
        .expect(200);

      expect(patchRes.body.locale).toBe('en');
    });

    it('should change email', async () => {
      const { email, password } = await createTestUser(app);
      const { token, secret } = await loginAndGetToken(app, email, password);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otp = require('otplib');
      const code = otp.generateSync({ secret });

      // PATCH email
      await request(app.getHttpServer())
        .patch('/v1/users/me/email')
        .set('Authorization', `Bearer ${token}`)
        .send({ newEmail: 'new_email@example.com', totpCode: code })
        .expect(204);
    });
  });

  // ── Profile ─────────────────────────────────────────────────

  describe('Users Controller - Profile', () => {
    it('GET /v1/users/me should return the authenticated user profile', async () => {
      const { email, password, user } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', user.id);
      expect(res.body).toHaveProperty('firstName');
      expect(res.body).toHaveProperty('lastName');
      expect(res.body).toHaveProperty('email');
    });

    it('PATCH /v1/users/me should update profile fields', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .patch('/v1/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'UpdatedName', bio: 'Hello world' })
        .expect(200);

      expect(res.body).toHaveProperty('firstName', 'UpdatedName');
      expect(res.body).toHaveProperty('bio', 'Hello world');
    });

    it('GET /v1/users/:user_id should return a public profile', async () => {
      const user1 = await createTestUser(app, 'user1');
      const user2 = await createTestUser(app, 'user2');
      const { token } = await loginAndGetToken(app, user1.email, user1.password);

      const res = await request(app.getHttpServer())
        .get(`/v1/users/${user2.user.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', user2.user.id);
      expect(res.body).toHaveProperty('firstName');
      expect(res.body).toHaveProperty('lastName');
    });

    it('GET /v1/users/:user_id should return 404 for a non-existent user', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ── Search ──────────────────────────────────────────────────

  describe('Users Controller - Search', () => {
    it('should search users by name with valid q', async () => {
      const { email, password, user } = await createTestUser(app, 'searcher');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'Test' })
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('offset');
      expect(res.body.meta).toHaveProperty('limit');
    });

    it('should return 400 when q is missing', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/users/search')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should support offset and limit pagination', async () => {
      const { email, password } = await createTestUser(app, 'pager');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'Test', offset: 0, limit: 5 })
        .expect(200);

      expect(res.body.meta.offset).toBe(0);
      expect(res.body.meta.limit).toBe(5);
    });

    it('should not return the requester in search results', async () => {
      const { email, password, user } = await createTestUser(app, 'selfsearch');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: user.firstName })
        .expect(200);

      const foundSelf = res.body.data.some(
        (item: any) => item.id === user.id,
      );
      expect(foundSelf).toBe(false);
    });

    it('should not return blocked users in search results', async () => {
      const user1 = await createTestUser(app, 'blocker');
      const user2 = await createTestUser(app, 'victim');
      const { token: token1 } = await loginAndGetToken(
        app,
        user1.email,
        user1.password,
      );

      // User1 blocks User2
      await request(app.getHttpServer())
        .post(`/v1/users/${user2.user.id}/block`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // User1 searches — should not see User2
      const res = await request(app.getHttpServer())
        .get('/v1/users/search')
        .set('Authorization', `Bearer ${token1}`)
        .query({ q: user2.user.firstName })
        .expect(200);

      const foundBlocked = res.body.data.some(
        (item: any) => item.id === user2.user.id,
      );
      expect(foundBlocked).toBe(false);
    });
  });

  // ── Discover ────────────────────────────────────────────────

  describe('Users Controller - Discover', () => {
    it('GET /v1/users/discover should return a paginated feed', async () => {
      const { email, password } = await createTestUser(app, 'discoverer');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/discover')
        .set('Authorization', `Bearer ${token}`)
        .query({ offset: 0, limit: 10 })
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /v1/users/discover should respect pagination defaults', async () => {
      const { email, password } = await createTestUser(app, 'discdefault');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/discover')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.meta.offset).toBe(0);
      expect(res.body.meta.limit).toBe(20);
    });
  });

  // ── Follow & Block ──────────────────────────────────────────

  describe('Social Module - Follow & Block', () => {
    it('should follow and unfollow a user', async () => {
      const user1 = await createTestUser(app, 'user1');
      const user2 = await createTestUser(app, 'user2');

      const { token: token1 } = await loginAndGetToken(
        app,
        user1.email,
        user1.password,
      );
      const targetId = user2.user.id;

      // Follow
      await request(app.getHttpServer())
        .post(`/v1/users/${targetId}/follow`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Verify followers list
      const getFollowers = await request(app.getHttpServer())
        .get(`/v1/users/${targetId}/followers`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(
        getFollowers.body.data.some((item: any) => item.id === user1.user.id),
      ).toBe(true);

      // Unfollow
      await request(app.getHttpServer())
        .delete(`/v1/users/${targetId}/follow`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(204);
    });

    it('should block and unblock a user', async () => {
      const user1 = await createTestUser(app, 'user1');
      const user2 = await createTestUser(app, 'user2');

      const { token: token1 } = await loginAndGetToken(
        app,
        user1.email,
        user1.password,
      );
      const targetId = user2.user.id;

      // Block
      await request(app.getHttpServer())
        .post(`/v1/users/${targetId}/block`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Verify block list
      const getBlocks = await request(app.getHttpServer())
        .get(`/v1/users/me/blocks`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(
        getBlocks.body.data.some((item: any) => item.id === targetId),
      ).toBe(true);

      // Unblock
      await request(app.getHttpServer())
        .delete(`/v1/users/${targetId}/block`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(204);
    });
  });

  // ── Swipes ──────────────────────────────────────────────────

  describe('Social Module - Swipes', () => {
    it('POST /v1/users/:user_id/swipe should register a like', async () => {
      const user1 = await createTestUser(app, 'swiper');
      const user2 = await createTestUser(app, 'target');
      const { token } = await loginAndGetToken(app, user1.email, user1.password);

      const res = await request(app.getHttpServer())
        .post(`/v1/users/${user2.user.id}/swipe`)
        .set('Authorization', `Bearer ${token}`)
        .send({ direction: 'like' })
        .expect(200);

      expect(res.body).toHaveProperty('message', 'Swipe enregistré');
    });

    it('POST /v1/users/:user_id/swipe should register a dislike', async () => {
      const user1 = await createTestUser(app, 'swiper2');
      const user2 = await createTestUser(app, 'target2');
      const { token } = await loginAndGetToken(app, user1.email, user1.password);

      await request(app.getHttpServer())
        .post(`/v1/users/${user2.user.id}/swipe`)
        .set('Authorization', `Bearer ${token}`)
        .send({ direction: 'dislike' })
        .expect(200);
    });

    it('POST /v1/users/:user_id/swipe should return 400 for invalid direction', async () => {
      const user1 = await createTestUser(app, 'badswiper');
      const user2 = await createTestUser(app, 'victim3');
      const { token } = await loginAndGetToken(app, user1.email, user1.password);

      await request(app.getHttpServer())
        .post(`/v1/users/${user2.user.id}/swipe`)
        .set('Authorization', `Bearer ${token}`)
        .send({ direction: 'invalid' })
        .expect(400);
    });

    it('GET /v1/users/me/swipes should return swipe history', async () => {
      const user1 = await createTestUser(app, 'history');
      const user2 = await createTestUser(app, 'target3');
      const { token } = await loginAndGetToken(app, user1.email, user1.password);

      // First create a swipe
      await request(app.getHttpServer())
        .post(`/v1/users/${user2.user.id}/swipe`)
        .set('Authorization', `Bearer ${token}`)
        .send({ direction: 'like' })
        .expect(200);

      // Then fetch history
      const res = await request(app.getHttpServer())
        .get('/v1/users/me/swipes')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Following & Friends ─────────────────────────────────────

  describe('Social Module - Following & Friends', () => {
    it('GET /v1/users/:user_id/following should return paginated following list', async () => {
      const user1 = await createTestUser(app, 'follower');
      const user2 = await createTestUser(app, 'followee');
      const { token } = await loginAndGetToken(app, user1.email, user1.password);

      // User1 follows User2
      await request(app.getHttpServer())
        .post(`/v1/users/${user2.user.id}/follow`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Check User1's following list
      const res = await request(app.getHttpServer())
        .get(`/v1/users/${user1.user.id}/following`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((item: any) => item.id === user2.user.id)).toBe(true);
    });

    it('GET /v1/users/:user_id/friends should return mutual follows', async () => {
      const user1 = await createTestUser(app, 'friend1');
      const user2 = await createTestUser(app, 'friend2');
      const { token: token1 } = await loginAndGetToken(app, user1.email, user1.password);
      const { token: token2 } = await loginAndGetToken(app, user2.email, user2.password);

      // Both follow each other (mutual)
      await request(app.getHttpServer())
        .post(`/v1/users/${user2.user.id}/follow`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/v1/users/${user1.user.id}/follow`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      // Check friends (from user1's perspective)
      const res = await request(app.getHttpServer())
        .get(`/v1/users/${user1.user.id}/friends`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body.data.some((item: any) => item.id === user2.user.id)).toBe(true);
    });

    it('GET /v1/users/:user_id/friends should support pagination', async () => {
      const user1 = await createTestUser(app, 'friendpag');
      const { token } = await loginAndGetToken(app, user1.email, user1.password);

      const res = await request(app.getHttpServer())
        .get(`/v1/users/${user1.user.id}/friends`)
        .set('Authorization', `Bearer ${token}`)
        .query({ offset: 0, limit: 5 })
        .expect(200);

      expect(res.body.meta.offset).toBe(0);
      expect(res.body.meta.limit).toBe(5);
    });
  });

  // ── Report ──────────────────────────────────────────────────

  describe('Social Module - Report', () => {
    it('POST /v1/users/:user_id/report should register a report', async () => {
      const user1 = await createTestUser(app, 'reporter');
      const user2 = await createTestUser(app, 'reported');
      const { token } = await loginAndGetToken(app, user1.email, user1.password);

      const res = await request(app.getHttpServer())
        .post(`/v1/users/${user2.user.id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Comportement inapproprié' })
        .expect(200);

      expect(res.body).toHaveProperty('message', 'Signalement enregistré');
    });

    it('POST /v1/users/:user_id/report should return 400 for empty reason', async () => {
      const user1 = await createTestUser(app, 'badreporter');
      const user2 = await createTestUser(app, 'badreported');
      const { token } = await loginAndGetToken(app, user1.email, user1.password);

      await request(app.getHttpServer())
        .post(`/v1/users/${user2.user.id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: '' })
        .expect(400);
    });
  });

  // ── Notification Preferences ────────────────────────────────

  describe('Users Controller - Notification Preferences', () => {
    it('GET /v1/users/me/notifications/preferences should return defaults', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/me/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('notifNewFollower');
      expect(res.body).toHaveProperty('notifNewListing');
      expect(res.body).toHaveProperty('notifNewEvent');
      expect(res.body).toHaveProperty('notifNewPoll');
      expect(res.body).toHaveProperty('notifWaitlist');
      expect(res.body).toHaveProperty('notifMessage');
    });

    it('PATCH /v1/users/me/notifications/preferences should update a preference', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .patch('/v1/users/me/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ notifNewFollower: false })
        .expect(200);

      expect(res.body.notifNewFollower).toBe(false);
    });

    it('PATCH /v1/users/me/notifications/preferences should keep omitted fields unchanged', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      // Get current state
      const before = await request(app.getHttpServer())
        .get('/v1/users/me/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Update only one field
      const res = await request(app.getHttpServer())
        .patch('/v1/users/me/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ notifMessage: false })
        .expect(200);

      expect(res.body.notifMessage).toBe(false);
      // PATCH only returns changed fields + userId/updatedAt — verify the update stuck
      expect(res.body).toHaveProperty('userId');

      // Re-fetch to confirm other fields were preserved
      const after = await request(app.getHttpServer())
        .get('/v1/users/me/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(after.body.notifMessage).toBe(false);
      // Other fields should still be their defaults (true)
      expect(after.body.notifNewFollower).toBe(true);
      expect(after.body.notifNewListing).toBe(true);
    });
  });

  // ── Change Password ─────────────────────────────────────────

  describe('Users Controller - Change Password', () => {
    it('PATCH /v1/users/me/password should return 401 with wrong current password', async () => {
      const { email, password } = await createTestUser(app);
      const { token, secret } = await loginAndGetToken(app, email, password);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otp = require('otplib');
      const code = secret ? otp.generateSync({ secret }) : '000000';

      await request(app.getHttpServer())
        .patch('/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword456!',
          totpCode: code,
        })
        .expect(401);
    });

    it('PATCH /v1/users/me/password should return 403 with invalid TOTP', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .patch('/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: password,
          newPassword: 'NewPassword456!',
          totpCode: '000000',
        })
        .expect(403);
    });

    it('PATCH /v1/users/me/password should change password with valid data', async () => {
      const { email, password } = await createTestUser(app);
      const { token, secret } = await loginAndGetToken(app, email, password);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otp = require('otplib');
      const code = secret ? otp.generateSync({ secret }) : '000000';

      const newPassword = 'NewPassword456!';

      await request(app.getHttpServer())
        .patch('/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: password,
          newPassword,
          totpCode: code,
        })
        .expect(204);

      // Verify we can login with the new password
      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);

      // Login succeeded if we got an access_token or a TOTP challenge
      const loggedIn =
        !!loginRes.body.access_token || !!loginRes.body.challenge_token;
      expect(loggedIn).toBe(true);
    });
  });

  // ── RGPD ────────────────────────────────────────────────────

  describe('Users Controller - RGPD', () => {
    it('GET /v1/users/me/export should return user data export', async () => {
      const { email, password } = await createTestUser(app, 'exportme');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/me/export')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('personalData');
    });

    it('GET /v1/users/me/export/csv should return CSV', async () => {
      const { email, password } = await createTestUser(app, 'csvme');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/me/export/csv')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('csv');
    });

    it('PATCH /v1/users/me/personal-data should rectify data', async () => {
      const { email, password } = await createTestUser(app, 'rectify');
      const { token, secret } = await loginAndGetToken(app, email, password);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const otp = require('otplib');
      const code = secret ? otp.generateSync({ secret }) : '000000';

      const res = await request(app.getHttpServer())
        .patch('/v1/users/me/personal-data')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Corrected', totpCode: code })
        .expect(200);

      expect(res.body).toHaveProperty('firstName', 'Corrected');
    });

    it('POST /v1/users/me/data-processing/opt-out should opt out', async () => {
      const { email, password } = await createTestUser(app, 'optout');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .post('/v1/users/me/data-processing/opt-out')
        .set('Authorization', `Bearer ${token}`)
        .send({ processingType: 'notifications' })
        .expect(201);
    });

    it('GET /v1/users/me/data-processing/opt-out should list opt-outs', async () => {
      const { email, password } = await createTestUser(app, 'listopts');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/users/me/data-processing/opt-out')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
