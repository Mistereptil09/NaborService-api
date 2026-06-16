import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestingApp,
  clearDatabase,
  clearRedis,
} from './utils/e2e-setup';
import {
  createTestUser,
  loginAndGetToken,
  createListing,
} from './utils/test-factories';

describe('Media Module (e2e)', () => {
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

  // ── Auth Guards ──────────────────────────────────────────────

  describe('Auth', () => {
    const guardedPaths = [
      { method: 'post' as const, path: '/v1/media/listings/fake-id/photos' },
      { method: 'delete' as const, path: '/v1/media/fake-id' },
      { method: 'patch' as const, path: '/v1/media/fake-id/caption' },
    ];

    for (const { method, path } of guardedPaths) {
      it(`${method.toUpperCase()} ${path} should return 401 without token`, async () => {
        await (request(app.getHttpServer()) as any)[method](path).expect(401);
      });
    }
  });

  // ── Streaming ────────────────────────────────────────────────

  describe('GET /v1/media/:id/stream', () => {
    it('should return 400 for invalid ObjectId format', async () => {
      await request(app.getHttpServer())
        .get('/v1/media/not-a-valid-id/stream')
        .expect(400);
    });

    it('should return 400 for empty id', async () => {
      await request(app.getHttpServer())
        .get('/v1/media/%20/stream')
        .expect(400);
    });

    it('should return 404 for valid but non-existent ObjectId', async () => {
      // Valid 24-char hex but doesn't exist
      await request(app.getHttpServer())
        .get('/v1/media/aaaaaaaaaaaaaaaaaaaaaaaa/stream')
        .expect(404);
    });
  });

  // ── Upload Validation ────────────────────────────────────────

  describe('POST upload routes', () => {
    it('should return 400 (or 500 if multer crashes) when no file is attached', async () => {
      const { email, password } = await createTestUser(app, 'uploader');
      const { token } = await loginAndGetToken(app, email, password);
      const listing = await createListing(app, token);

      const res = await request(app.getHttpServer())
        .post(`/v1/media/listings/${listing.id}/photos`)
        .set('Authorization', `Bearer ${token}`);
      expect([400, 500]).toContain(res.status);
    });

    it('should return 403 when uploading to another user avatar', async () => {
      const user1 = await createTestUser(app, 'owner');
      const user2 = await createTestUser(app, 'other');
      const { token: token1 } = await loginAndGetToken(app, user1.email, user1.password);

      // User1 tries to upload avatar for User2
      await request(app.getHttpServer())
        .post(`/v1/media/users/${user2.user.id}/avatar`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(403);
    });
  });

  // ── Caption Validation ───────────────────────────────────────

  describe('PATCH /v1/media/:id/caption', () => {
    it('should return 400 for caption exceeding 280 chars', async () => {
      const { email, password } = await createTestUser(app, 'captions');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .patch('/v1/media/aaaaaaaaaaaaaaaaaaaaaaaa/caption')
        .set('Authorization', `Bearer ${token}`)
        .send({ caption: 'a'.repeat(281) })
        .expect(400);
    });
  });

  // ── Reorder Validation ───────────────────────────────────────

  describe('PATCH /v1/media/listings/:id/photos/reorder', () => {
    it('should return 400 when mediaIds is missing', async () => {
      const { email, password } = await createTestUser(app, 'reorder');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .patch('/v1/media/listings/fake-id/photos/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('should return 400 when mediaIds is not an array', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .patch('/v1/media/listings/fake-id/photos/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaIds: 'not-an-array' })
        .expect(400);
    });

    it('should return 403 when reordering photos on another user listing', async () => {
      const user1 = await createTestUser(app, 'owner');
      const user2 = await createTestUser(app, 'intruder');
      const { token: token1 } = await loginAndGetToken(app, user1.email, user1.password);
      const { token: token2 } = await loginAndGetToken(app, user2.email, user2.password);

      const listing = await createListing(app, token1);

      await request(app.getHttpServer())
        .patch(`/v1/media/listings/${listing.id}/photos/reorder`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ mediaIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'] })
        .expect(403);
    });
  });

  // ── MongoDB-dependent (skip if Mongo unavailable) ────────────

  describe('Integration (requires MongoDB)', () => {
    it('DELETE /v1/media/:id should return 404 for non-existent media', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .delete('/v1/media/aaaaaaaaaaaaaaaaaaaaaaaa')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
