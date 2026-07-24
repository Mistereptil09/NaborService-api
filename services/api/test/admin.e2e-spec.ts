import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';
import {
  createTestUser,
  loginAndGetToken,
  createAdminUser,
} from './utils/test-factories';

describe('Admin Module (e2e)', () => {
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

  describe('Auth', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/v1/admin/users').expect(401);
    });

    it('should return 403 for non-admin users', async () => {
      const { email, password } = await createTestUser(app, 'regular');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('GET /v1/admin/users', () => {
    it('should list users as admin', async () => {
      const admin = await createAdminUser(app, 'admin');
      await createTestUser(app, 'u1');
      await createTestUser(app, 'u2');

      const res = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.users)).toBe(true);
    });

    it('should support pagination', async () => {
      const admin = await createAdminUser(app, 'admin2');

      const res = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .query({ offset: 0, limit: 5 })
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('total');
    });

    it('should return paginated results', async () => {
      const admin = await createAdminUser(app, 'admin3');

      const res = await request(app.getHttpServer())
        .get('/v1/admin/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .query({ offset: 0, limit: 2 })
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(res.body.users.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /v1/admin/users/:id', () => {
    it('should return user detail as admin', async () => {
      const admin = await createAdminUser(app, 'admin');
      const user = await createTestUser(app, 'target');

      const res = await request(app.getHttpServer())
        .get(`/v1/admin/users/${user.user.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', user.user.id);
    });

    it('should return 404 for non-existent user', async () => {
      const admin = await createAdminUser(app, 'admin4');

      await request(app.getHttpServer())
        .get('/v1/admin/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('PATCH /v1/admin/users/:id/role', () => {
    it('should update user role', async () => {
      const admin = await createAdminUser(app, 'admin');
      const user = await createTestUser(app, 'target');

      const res = await request(app.getHttpServer())
        .patch(`/v1/admin/users/${user.user.id}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'moderator' })
        .expect(200);

      expect(res.body).toHaveProperty('role', 'moderator');
    });

    it('should return 400 for invalid role', async () => {
      const admin = await createAdminUser(app, 'admin6');
      const user = await createTestUser(app, 'target6');

      await request(app.getHttpServer())
        .patch(`/v1/admin/users/${user.user.id}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'invalid_role' })
        .expect(400);
    });
  });

  describe('Suspend & Restore', () => {
    it('POST /v1/admin/users/:id/suspend should suspend a user', async () => {
      const admin = await createAdminUser(app, 'admin');
      const user = await createTestUser(app, 'victim');

      const res = await request(app.getHttpServer())
        .post(`/v1/admin/users/${user.user.id}/suspend`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(res.body).toHaveProperty('isSuspended', true);
    });

    it('POST /v1/admin/users/:id/restore should restore a suspended user', async () => {
      const admin = await createAdminUser(app, 'admin');
      const user = await createTestUser(app, 'victim');

      await request(app.getHttpServer())
        .post(`/v1/admin/users/${user.user.id}/suspend`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/v1/admin/users/${user.user.id}/restore`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(res.body).toHaveProperty('isSuspended', false);
    });
  });

  describe('POST /v1/admin/points/adjust', () => {
    it('should credit points to a user as admin', async () => {
      const admin = await createAdminUser(app, 'pointsadmin');
      const user = await createTestUser(app, 'pointsuser');

      const res = await request(app.getHttpServer())
        .post('/v1/admin/points/adjust')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          userId: user.user.id,
          amountPoints: 500,
          description: 'Manual credit',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        userId: user.user.id,
        amountPoints: 500,
        balanceAfterPoints: 500,
      });
      expect(res.body).toHaveProperty('entryId');
    });

    it('should debit points from a user as admin', async () => {
      const admin = await createAdminUser(app, 'pointsadmin2');
      const user = await createTestUser(app, 'pointsuser2');

      await request(app.getHttpServer())
        .post('/v1/admin/points/adjust')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userId: user.user.id, amountPoints: 500 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/v1/admin/points/adjust')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userId: user.user.id, amountPoints: -200 })
        .expect(200);

      expect(res.body.balanceAfterPoints).toBe(300);
    });

    it('should reject adjustment that would make balance negative', async () => {
      const admin = await createAdminUser(app, 'pointsadmin3');
      const user = await createTestUser(app, 'pointsuser3');

      await request(app.getHttpServer())
        .post('/v1/admin/points/adjust')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userId: user.user.id, amountPoints: -100 })
        .expect(409);
    });

    it('should return 403 for non-admin users', async () => {
      const { email, password } = await createTestUser(app, 'regularpoints');
      const { token } = await loginAndGetToken(app, email, password);
      const target = await createTestUser(app, 'targetpoints');

      await request(app.getHttpServer())
        .post('/v1/admin/points/adjust')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: target.user.id, amountPoints: 100 })
        .expect(403);
    });

    it('should create an admin_adjustment ledger entry', async () => {
      const admin = await createAdminUser(app, 'ledgeradmin');
      const user = await createTestUser(app, 'ledgeruser');

      await request(app.getHttpServer())
        .post('/v1/admin/points/adjust')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ userId: user.user.id, amountPoints: 123, description: 'Test' })
        .expect(200);

      const ledgerRes = await request(app.getHttpServer())
        .get('/v1/admin/points/ledger')
        .set('Authorization', `Bearer ${admin.token}`)
        .query({ userId: user.user.id })
        .expect(200);

      expect(ledgerRes.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: user.user.id,
            amountPoints: 123,
            type: 'admin_adjustment',
            description: 'Test',
          }),
        ]),
      );
    });
  });

  describe('GET/PATCH /v1/admin/config', () => {
    it('GET /v1/admin/config should return platform config', async () => {
      const admin = await createAdminUser(app, 'cfgadmin');
      const res = await request(app.getHttpServer())
        .get('/v1/admin/config')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(res.body).toHaveProperty('contractExpirationHours');
    });

    it('PATCH /v1/admin/config should update config', async () => {
      const admin = await createAdminUser(app, 'cfgpatch');
      const res = await request(app.getHttpServer())
        .patch('/v1/admin/config')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ contractExpirationHours: 72 })
        .expect(200);

      expect(res.body).toHaveProperty('contractExpirationHours', 72);
    });

    it('should return 403 for non-admin', async () => {
      const { email, password } = await createTestUser(app, 'nocfg');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/admin/config')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('Admin RGPD', () => {
    it('GET /v1/admin/rgpd/requests should list RGPD requests', async () => {
      const admin = await createAdminUser(app, 'rgpdadmin');
      const res = await request(app.getHttpServer())
        .get('/v1/admin/rgpd/requests')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return 403 for non-admin', async () => {
      const { email, password } = await createTestUser(app, 'norgpd');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/admin/rgpd/requests')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('Admin Stats', () => {
    it('GET /v1/admin/stats/overview should return stats', async () => {
      const admin = await createAdminUser(app, 'statadmin');
      const res = await request(app.getHttpServer())
        .get('/v1/admin/stats/overview')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalUsers');
    });

    it('GET /v1/admin/stats/users should return user stats', async () => {
      const admin = await createAdminUser(app, 'userstat');
      const res = await request(app.getHttpServer())
        .get('/v1/admin/stats/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(res.body).toHaveProperty('roleBreakdown');
    });

    it('should return 403 for non-admin', async () => {
      const { email, password } = await createTestUser(app, 'nostats');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/admin/stats/overview')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });
});
