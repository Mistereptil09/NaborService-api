import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';
import {
  createTestUser,
  createAdminUser,
  loginAndGetToken,
} from './utils/test-factories';

const VALID_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [2.3522, 48.8566],
      [2.3522, 48.86],
      [2.356, 48.86],
      [2.356, 48.8566],
      [2.3522, 48.8566],
    ],
  ],
};

const OVERLAPPING_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [2.353, 48.857],
      [2.353, 48.859],
      [2.355, 48.859],
      [2.355, 48.857],
      [2.353, 48.857],
    ],
  ],
};

describe('Admin Neighbourhoods (e2e)', () => {
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

  // ── Auth guards ─────────────────────────────────────────────

  describe('Authorization', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/v1/admin/neighbourhoods')
        .expect(401);
    });

    it('should return 403 for non-admin users', async () => {
      const { email, password } = await createTestUser(app, 'regular');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/admin/neighbourhoods')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  // ── CRUD with admin ─────────────────────────────────────────

  describe('Neighbourhood CRUD (admin)', () => {
    async function setupAdmin() {
      const admin = await createAdminUser(app);
      return admin.token;
    }

    it('GET /v1/admin/neighbourhoods should list neighbourhoods', async () => {
      const adminToken = await setupAdmin();

      const res = await request(app.getHttpServer())
        .get('/v1/admin/neighbourhoods')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /v1/admin/neighbourhoods should create a neighbourhood', async () => {
      const adminToken = await setupAdmin();

      const res = await request(app.getHttpServer())
        .post('/v1/admin/neighbourhoods')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pg_id: 'test-neighbourhood-1',
          name: 'Test Quartier',
          city: 'Paris',
          zip_code: '75001',
          country: 'FR',
          geometry: VALID_POLYGON,
        })
        .expect(201);

      expect(res.body).toHaveProperty('pg_id', 'test-neighbourhood-1');
      expect(res.body).toHaveProperty('centroid');
      expect(res.body).toHaveProperty('area_m2');
      expect(res.body).toHaveProperty('adjacent_pg_ids');
    });

    it('POST /v1/admin/neighbourhoods should return 400 with missing fields', async () => {
      const adminToken = await setupAdmin();

      await request(app.getHttpServer())
        .post('/v1/admin/neighbourhoods')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Incomplete' })
        .expect(400);
    });

    it('POST /v1/admin/neighbourhoods/overlap-check should detect overlaps', async () => {
      const adminToken = await setupAdmin();

      // First create a neighbourhood
      await request(app.getHttpServer())
        .post('/v1/admin/neighbourhoods')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pg_id: 'base-neighbourhood',
          name: 'Base Quartier',
          city: 'Paris',
          zip_code: '75001',
          country: 'FR',
          geometry: VALID_POLYGON,
        })
        .expect(201);

      // Then check overlap with a polygon that overlaps it
      const res = await request(app.getHttpServer())
        .post('/v1/admin/neighbourhoods/overlap-check')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ geometry: OVERLAPPING_POLYGON })
        .expect(200);

      expect(res.body).toHaveProperty('overlapping');
      expect(res.body).toHaveProperty('adjacent');
      expect(Array.isArray(res.body.overlapping)).toBe(true);
      expect(Array.isArray(res.body.adjacent)).toBe(true);
    });

    it('POST /v1/admin/neighbourhoods/overlap-check should return 400 for invalid geometry', async () => {
      const adminToken = await setupAdmin();

      await request(app.getHttpServer())
        .post('/v1/admin/neighbourhoods/overlap-check')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ geometry: { type: 'Point', coordinates: [0, 0] } })
        .expect(400);
    });

    it('PATCH /v1/admin/neighbourhoods/:id should update metadata', async () => {
      const adminToken = await setupAdmin();

      // Create first
      await request(app.getHttpServer())
        .post('/v1/admin/neighbourhoods')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pg_id: 'update-me',
          name: 'Original Name',
          city: 'Paris',
          zip_code: '75001',
          country: 'FR',
          geometry: VALID_POLYGON,
        })
        .expect(201);

      // Update
      const res = await request(app.getHttpServer())
        .patch('/v1/admin/neighbourhoods/update-me')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Name', city: 'Lyon' })
        .expect(200);

      expect(res.body).toHaveProperty('pg_id', 'update-me');
    });

    it('PATCH /v1/admin/neighbourhoods/:id should return 404 for unknown id', async () => {
      const adminToken = await setupAdmin();

      await request(app.getHttpServer())
        .patch('/v1/admin/neighbourhoods/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });

    it('DELETE /v1/admin/neighbourhoods/:id should delete a neighbourhood without residents', async () => {
      const adminToken = await setupAdmin();

      // Create
      await request(app.getHttpServer())
        .post('/v1/admin/neighbourhoods')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          pg_id: 'delete-me',
          name: 'To Delete',
          city: 'Paris',
          zip_code: '75001',
          country: 'FR',
          geometry: VALID_POLYGON,
        })
        .expect(201);

      // Delete
      const res = await request(app.getHttpServer())
        .delete('/v1/admin/neighbourhoods/delete-me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });

    it('POST /v1/admin/neighbourhoods/reconcile should trigger reconciliation', async () => {
      const adminToken = await setupAdmin();

      const res = await request(app.getHttpServer())
        .post('/v1/admin/neighbourhoods/reconcile')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hours: 24 })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('message');
    });
  });
});
