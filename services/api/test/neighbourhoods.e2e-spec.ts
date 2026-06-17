import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';
import { createTestUser, loginAndGetToken } from './utils/test-factories';

describe('Neighbourhoods Module (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestingApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    await clearRedis(app);
  });

  // ── Public routes ──────────────────────────────────────

  describe('GET /v1/neighbourhoods (public)', () => {
    it('should return 200 without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/neighbourhoods')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return neighbourhoods with expected shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/neighbourhoods')
        .expect(200);

      if (res.body.length > 0) {
        const nb = res.body[0];
        expect(nb).toHaveProperty('pgId');
        expect(nb).toHaveProperty('name');
        expect(nb).toHaveProperty('city');
        expect(nb).toHaveProperty('zipCode');
        expect(nb).toHaveProperty('country');
        // No geometry/centroid in public listing
        expect(nb).not.toHaveProperty('geometry');
        expect(nb).not.toHaveProperty('centroid');
      }
    });
  });

  describe('GET /v1/neighbourhoods/nearby (public)', () => {
    it('should return 200 with lat/lng params', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/neighbourhoods/nearby?lat=48.8566&lng=2.3522&radius=5000')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('pgId');
        expect(res.body[0]).toHaveProperty('name');
        expect(res.body[0]).toHaveProperty('distanceMeters');
      }
    });

    it('should return 200 without radius (default 2000m)', async () => {
      await request(app.getHttpServer())
        .get('/v1/neighbourhoods/nearby?lat=48.8566&lng=2.3522')
        .expect(200);
    });

    it('should return 400 with missing params', async () => {
      await request(app.getHttpServer())
        .get('/v1/neighbourhoods/nearby')
        .expect(400);
    });
  });

  // ── Auth routes ────────────────────────────────────────

  describe('Auth-required routes', () => {
    let token: string;

    beforeEach(async () => {
      const { email, password } = await createTestUser(app, 'nbuser');
      const result = await loginAndGetToken(app, email, password);
      token = result.token;
    });

    it('GET /v1/neighbourhoods/:id should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .get('/v1/neighbourhoods/nb-test')
        .expect(401);
    });

    it('GET /v1/neighbourhoods/:id/members should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .get('/v1/neighbourhoods/nb-test/members')
        .expect(401);
    });

    it('GET /v1/neighbourhoods/:id/adjacent should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .get('/v1/neighbourhoods/nb-test/adjacent')
        .expect(401);
    });

    it('GET /v1/neighbourhoods/:id should return 404 for unknown nb (auth)', async () => {
      await request(app.getHttpServer())
        .get('/v1/neighbourhoods/nonexistent-nb-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('GET /v1/neighbourhoods/:id/members should return 404 for unknown nb', async () => {
      await request(app.getHttpServer())
        .get('/v1/neighbourhoods/nonexistent-nb-id/members')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('GET /v1/neighbourhoods/:id/adjacent should return 404 for unknown nb', async () => {
      await request(app.getHttpServer())
        .get('/v1/neighbourhoods/nonexistent-nb-id/adjacent')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
