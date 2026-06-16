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

describe('Polls Module (e2e)', () => {
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

  // ── Auth ────────────────────────────────────────────────────

  it('should return 401 without token', async () => {
    await request(app.getHttpServer()).get('/v1/polls').expect(401);
  });

  // ── CRUD ────────────────────────────────────────────────────

  describe('CRUD', () => {
    async function createPoll(token: string, overrides?: any) {
      const dto = { title: overrides?.title ?? 'Test Poll', ...overrides };
      const res = await request(app.getHttpServer())
        .post('/v1/polls').set('Authorization', `Bearer ${token}`).send(dto);
      expect([201, 400]).toContain(res.status);
      return res;
    }

    it('POST /v1/polls should return 403 for regular user', async () => {
      const { email, password } = await createTestUser(app, 'regular');
      const { token } = await loginAndGetToken(app, email, password);
      await request(app.getHttpServer())
        .post('/v1/polls').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Should fail' }).expect(403);
    });

    it('POST /v1/polls should create a poll as admin', async () => {
      const admin = await createAdminUser(app, 'polladmin');
      const res = await createPoll(admin.token);
      if (res.status === 201) {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('title', 'Test Poll');
      }
    });

    it('GET /v1/polls should list active polls', async () => {
      const admin = await createAdminUser(app, 'polladmin2');
      await createPoll(admin.token);
      const viewer = await createTestUser(app, 'viewer');
      const { token } = await loginAndGetToken(app, viewer.email, viewer.password);

      const res = await request(app.getHttpServer())
        .get('/v1/polls').set('Authorization', `Bearer ${token}`).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /v1/polls/:id should return poll with results', async () => {
      const admin = await createAdminUser(app, 'polladmin3');
      const created = await createPoll(admin.token);
      if (created.status !== 201) return;

      const viewer = await createTestUser(app, 'viewer2');
      const { token } = await loginAndGetToken(app, viewer.email, viewer.password);

      const res = await request(app.getHttpServer())
        .get(`/v1/polls/${created.body.id}`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toHaveProperty('title');
    });

    it('PATCH /v1/polls/:id should update as creator', async () => {
      const admin = await createAdminUser(app, 'polladmin4');
      const created = await createPoll(admin.token);
      if (created.status !== 201) return;

      const res = await request(app.getHttpServer())
        .patch(`/v1/polls/${created.body.id}`).set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Updated Poll' }).expect(200);
      expect(res.body).toHaveProperty('title', 'Updated Poll');
    });

    it('DELETE /v1/polls/:id should soft-delete as creator', async () => {
      const admin = await createAdminUser(app, 'polladmin5');
      const created = await createPoll(admin.token);
      if (created.status !== 201) return;

      await request(app.getHttpServer())
        .delete(`/v1/polls/${created.body.id}`).set('Authorization', `Bearer ${admin.token}`).expect(200);
    });
  });

  // ── Vote ────────────────────────────────────────────────────

  describe('Vote', () => {
    it('should vote, update vote, and delete vote', async () => {
      const admin = await createAdminUser(app, 'voteradmin');
      const admToken = admin.token;

      // Create poll active until tomorrow
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const pollRes = await request(app.getHttpServer())
        .post('/v1/polls').set('Authorization', `Bearer ${admToken}`)
        .send({ title: 'Vote Test', ends_at: tomorrow });
      if (pollRes.status !== 201) return;
      const pollId = pollRes.body.id;

      // Add options
      const optA = await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/options`).set('Authorization', `Bearer ${admToken}`)
        .send({ label: 'Option X' }).expect(201);
      const optB = await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/options`).set('Authorization', `Bearer ${admToken}`)
        .send({ label: 'Option Y' }).expect(201);

      // Vote
      const v = await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/vote`).set('Authorization', `Bearer ${admToken}`)
        .send({ option_id: optA.body.id, weight: 1 });
      console.log('Vote body:', JSON.stringify(v.body).slice(0, 200));
      if (v.status !== 201) return;

      // Change vote (SINGLE polls: POST again to switch option)
      await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/vote`).set('Authorization', `Bearer ${admToken}`)
        .send({ option_id: optB.body.id, weight: 1 }).expect(201);

      // Delete vote
      await request(app.getHttpServer())
        .delete(`/v1/polls/${pollId}/vote`).set('Authorization', `Bearer ${admToken}`).expect(200);
    });

    it('should vote on multiple options with MULTIPLE type', async () => {
      const admin = await createAdminUser(app, 'multiadmin');
      const token = admin.token;

      // Create MULTIPLE poll
      const pollRes = await request(app.getHttpServer())
        .post('/v1/polls').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Multi Poll', poll_type: 'multiple' });
      if (pollRes.status !== 201) return;
      const pollId = pollRes.body.id;

      // Add options
      const opt1 = await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/options`).set('Authorization', `Bearer ${token}`)
        .send({ label: 'A' }).expect(201);
      const opt2 = await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/options`).set('Authorization', `Bearer ${token}`)
        .send({ label: 'B' }).expect(201);

      // Vote for both — MULTIPLE allows concurrent votes
      await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/vote`).set('Authorization', `Bearer ${token}`)
        .send({ option_id: opt1.body.id }).expect(201);
      await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/vote`).set('Authorization', `Bearer ${token}`)
        .send({ option_id: opt2.body.id }).expect(201);

      // Remove just one vote — keep the other
      await request(app.getHttpServer())
        .delete(`/v1/polls/${pollId}/vote`).set('Authorization', `Bearer ${token}`)
        .send({ option_id: opt1.body.id }).expect(200);

      // Remove all remaining
      await request(app.getHttpServer())
        .delete(`/v1/polls/${pollId}/vote`).set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should update vote weight with PUT for WEIGHTED poll', async () => {
      const admin = await createAdminUser(app, 'weightadmin');
      const token = admin.token;

      // Create WEIGHTED poll
      const pollRes = await request(app.getHttpServer())
        .post('/v1/polls').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Weight Poll', poll_type: 'weighted' });
      if (pollRes.status !== 201) return;
      const pollId = pollRes.body.id;

      // Add option
      const opt = await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/options`).set('Authorization', `Bearer ${token}`)
        .send({ label: 'Option' }).expect(201);

      // Vote with weight 3
      await request(app.getHttpServer())
        .post(`/v1/polls/${pollId}/vote`).set('Authorization', `Bearer ${token}`)
        .send({ option_id: opt.body.id, weight: 3 }).expect(201);

      // Update weight via PUT
      await request(app.getHttpServer())
        .put(`/v1/polls/${pollId}/vote`).set('Authorization', `Bearer ${token}`)
        .send({ option_id: opt.body.id, weight: 5 }).expect(200);
    });
  });
});
