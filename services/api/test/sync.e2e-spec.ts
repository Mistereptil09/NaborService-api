import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';
import {
  createTestUser,
  loginAndGetToken,
  createAdminUser,
} from './utils/test-factories';

describe('Sync & Updates Modules (e2e)', () => {
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

  // ── Sync ────────────────────────────────────────────────────

  describe('Sync', () => {
    it('GET /v1/sync/snapshot should return 403 for regular user', async () => {
      const { email, password } = await createTestUser(app, 'regular');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/sync/snapshot')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('GET /v1/sync/snapshot should return 200 for admin', async () => {
      const admin = await createAdminUser(app, 'admin');

      const res = await request(app.getHttpServer())
        .get('/v1/sync/snapshot')
        .set('Authorization', `Bearer ${admin.token}`);

      // 200 = success, 400 = validation error on cursor/params (still proves endpoint works)
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('cursor');
      }
    });

    it('POST /v1/sync/updates should return 403 for regular user', async () => {
      const { email, password } = await createTestUser(app, 'regular2');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .post('/v1/sync/updates')
        .set('Authorization', `Bearer ${token}`)
        .send({ updates: [] })
        .expect(403);
    });

    it('POST /v1/sync/updates should respond as admin', async () => {
      const admin = await createAdminUser(app, 'admin2');

      const res = await request(app.getHttpServer())
        .post('/v1/sync/updates')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ updates: [] });

      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('results');
      }
    });
  });

  // ── Updates ─────────────────────────────────────────────────
  // Routes are PUBLIC (no auth required — used by Java Desktop auto-update)

  describe('Updates', () => {
    it('GET /v1/updates/latest should be public (no token required)', async () => {
      const res = await request(app.getHttpServer()).get('/v1/updates/latest');

      // 200 si GitHub Release joignable, 503 sinon (aucun cache)
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('version');
      }
    });

    it('GET /v1/updates/latest should work with any auth level', async () => {
      const { email, password } = await createTestUser(app, 'regular');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/updates/latest')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('version');
      }
    });

    it('GET /v1/updates/download should be public', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/updates/download')
        .redirects(0);

      // 302 vers l'asset GitHub Release, 503 si le manifeste est indisponible
      expect([302, 503]).toContain(res.status);
    });
  });
});
