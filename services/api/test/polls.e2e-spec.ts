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
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await clearDatabase(app);
    await clearRedis(app);
  });

  // ── Auth ────────────────────────────────────────────────────

  it('should return 401 without token', async () => {
    await request(app.getHttpServer())
      .get('/v1/polls')
      .expect(401);
  });

  // ── CRUD ────────────────────────────────────────────────────

  describe('CRUD', () => {
    async function setupPollCreator() {
      // Poll creation requires neighbourhood_rep, moderator, or admin role
      const admin = await createAdminUser(app, 'polladmin');
      return admin.token;
    }

    it('POST /v1/polls should return 403 for regular user', async () => {
      const { email, password } = await createTestUser(app, 'regular');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .post('/v1/polls')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Should fail',
          description: 'Regular users cannot create polls',
          options: [{ label: 'Yes' }, { label: 'No' }],
        })
        .expect(403);
    });

    it('POST /v1/polls should create a poll as admin', async () => {
      const adminToken = await setupPollCreator();

      const res = await request(app.getHttpServer())
        .post('/v1/polls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Community Poll',
          description: 'What should we do?',
          options: [{ label: 'Option A' }, { label: 'Option B' }],
          ends_at: new Date(Date.now() + 86400000 * 7).toISOString(),
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('title', 'Community Poll');
    });

    it('GET /v1/polls should list active polls', async () => {
      const adminToken = await setupPollCreator();

      await request(app.getHttpServer())
        .post('/v1/polls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Poll 1',
          options: [{ label: 'A' }],
        })
        .expect(201);

      const { email, password } = await createTestUser(app, 'viewer');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get('/v1/polls')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /v1/polls/:id should return poll with results', async () => {
      const adminToken = await setupPollCreator();

      const created = await request(app.getHttpServer())
        .post('/v1/polls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Detail Poll',
          options: [{ label: 'Yes' }, { label: 'No' }],
        })
        .expect(201);

      const { email, password } = await createTestUser(app, 'viewer');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .get(`/v1/polls/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('title', 'Detail Poll');
    });

    it('PATCH /v1/polls/:id should update as creator', async () => {
      const adminToken = await setupPollCreator();

      const created = await request(app.getHttpServer())
        .post('/v1/polls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Update Me',
          options: [{ label: 'Opt' }],
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/v1/polls/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated Poll' })
        .expect(200);

      expect(res.body).toHaveProperty('title', 'Updated Poll');
    });

    it('DELETE /v1/polls/:id should soft-delete as creator', async () => {
      const adminToken = await setupPollCreator();

      const created = await request(app.getHttpServer())
        .post('/v1/polls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Delete Me',
          options: [{ label: 'Opt' }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/polls/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ── Vote ────────────────────────────────────────────────────

  describe('Vote', () => {
    it('should vote, update vote, and delete vote', async () => {
      const admin = await createAdminUser(app, 'polladmin');
      const adminToken = admin.token;

      const poll = await request(app.getHttpServer())
        .post('/v1/polls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Vote Test',
          options: [{ label: 'Option X' }, { label: 'Option Y' }],
        })
        .expect(201);

      const optionId = poll.body.options[0].id;

      // Vote
      const voteRes = await request(app.getHttpServer())
        .post(`/v1/polls/${poll.body.id}/vote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ option_id: optionId, weight: 1 })
        .expect(201);

      expect(voteRes.body).toHaveProperty('optionId', optionId);

      // Change vote
      const otherOptionId = poll.body.options[1].id;
      await request(app.getHttpServer())
        .put(`/v1/polls/${poll.body.id}/vote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ option_id: otherOptionId, weight: 1 })
        .expect(200);

      // Delete vote
      await request(app.getHttpServer())
        .delete(`/v1/polls/${poll.body.id}/vote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});
