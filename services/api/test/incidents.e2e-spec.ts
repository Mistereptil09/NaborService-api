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
  createAdminUser,
} from './utils/test-factories';

describe('Incidents Module (e2e)', () => {
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

  // ── Auth ─────────────────────────────────────────────────────

  describe('Auth', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/v1/incidents')
        .expect(401);
    });
  });

  // ── CRUD ─────────────────────────────────────────────────────

  describe('CRUD', () => {
    it('POST /v1/incidents should create an incident', async () => {
      const { email, password } = await createTestUser(app, 'reporter');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .post('/v1/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Street light broken',
          description: 'The light on Main St has been out for 3 days',
          severity: 'medium',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('title', 'Street light broken');
    });

    it('POST /v1/incidents should return 400 without title', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .post('/v1/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'No title' })
        .expect(400);
    });

    it('GET /v1/incidents should return paginated incidents', async () => {
      const { email, password } = await createTestUser(app, 'lister');
      const { token } = await loginAndGetToken(app, email, password);

      // Create an incident first
      await request(app.getHttpServer())
        .post('/v1/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test', severity: 'low' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/incidents')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /v1/incidents/:id should return incident detail', async () => {
      const { email, password } = await createTestUser(app, 'getter');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await request(app.getHttpServer())
        .post('/v1/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'My Incident', severity: 'low' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/v1/incidents/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('title', 'My Incident');
    });

    it('GET /v1/incidents/:id should return 404 for non-existent', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/incidents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('PATCH /v1/incidents/:id should update own incident', async () => {
      const { email, password } = await createTestUser(app, 'updater');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await request(app.getHttpServer())
        .post('/v1/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Original', severity: 'low' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/v1/incidents/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Incident' })
        .expect(200);

      expect(res.body).toHaveProperty('title', 'Updated Incident');
    });

    it('DELETE /v1/incidents/:id should delete own incident', async () => {
      const { email, password } = await createTestUser(app, 'deleter');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await request(app.getHttpServer())
        .post('/v1/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'To Delete', severity: 'low' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/v1/incidents/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });
  });

  // ── Admin-only routes ────────────────────────────────────────

  describe('Admin / Moderator routes', () => {
    it('POST /v1/incidents/:id/assign should return 403 for regular user', async () => {
      const { email, password } = await createTestUser(app, 'reporter');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await request(app.getHttpServer())
        .post('/v1/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Issue', severity: 'low' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/incidents/${created.body.id}/assign`)
        .set('Authorization', `Bearer ${token}`)
        .send({ assignee_id: '00000000-0000-0000-0000-000000000000' })
        .expect(403);
    });

    it('POST /v1/incidents/:id/resolve should work for admin', async () => {
      const admin = await createAdminUser(app, 'admin');
      const adminToken = admin.token;

      // Create incident as admin
      const created = await request(app.getHttpServer())
        .post('/v1/incidents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Resolvable', severity: 'low' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/incidents/${created.body.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
    });
  });
});
