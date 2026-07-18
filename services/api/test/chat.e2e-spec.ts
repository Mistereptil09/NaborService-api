import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';
import { createTestUser, loginAndGetToken } from './utils/test-factories';

describe('Chat Module (e2e)', () => {
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
    await request(app.getHttpServer()).get('/v1/chat/groups').expect(401);
  });

  // ── Groups CRUD ─────────────────────────────────────────────

  describe('Groups', () => {
    it('POST /v1/chat/groups should create a group', async () => {
      const { email, password } = await createTestUser(app, 'creator');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .post('/v1/chat/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Group', description: 'A test chat group' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name', 'Test Group');
    });

    it('GET /v1/chat/groups should list user groups', async () => {
      const { email, password } = await createTestUser(app, 'grouper');
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .post('/v1/chat/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'My Group' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/v1/chat/groups')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /v1/chat/groups/:id should return group detail', async () => {
      const { email, password } = await createTestUser(app, 'detail');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await request(app.getHttpServer())
        .post('/v1/chat/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Detail Group' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/v1/chat/groups/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Detail Group');
    });

    it('PATCH /v1/chat/groups/:id should update group', async () => {
      const { email, password } = await createTestUser(app, 'updater');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await request(app.getHttpServer())
        .post('/v1/chat/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Original' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/v1/chat/groups/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated', description: 'New desc' })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Updated');
    });

    it('DELETE /v1/chat/groups/:id should soft-delete group', async () => {
      const { email, password } = await createTestUser(app, 'deleter');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await request(app.getHttpServer())
        .post('/v1/chat/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'To Delete' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/v1/chat/groups/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  // ── Members ─────────────────────────────────────────────────

  describe('Members', () => {
    it('GET /v1/chat/groups/:id/members should list members', async () => {
      const { email, password } = await createTestUser(app, 'owner');
      const { token } = await loginAndGetToken(app, email, password);

      const group = await request(app.getHttpServer())
        .post('/v1/chat/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Member Test' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/v1/chat/groups/${group.body.id}/members`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /v1/chat/groups/:id/members should add a member', async () => {
      const user1 = await createTestUser(app, 'owner');
      const user2 = await createTestUser(app, 'joiner');
      const { token: token1 } = await loginAndGetToken(
        app,
        user1.email,
        user1.password,
      );

      const group = await request(app.getHttpServer())
        .post('/v1/chat/groups')
        .set('Authorization', `Bearer ${token1}`)
        .send({ name: 'Add Member Test' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/v1/chat/groups/${group.body.id}/members`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ user_id: user2.user.id })
        .expect(201);
    });
  });

  // ── Mute ────────────────────────────────────────────────────

  describe('Mute', () => {
    it('POST + DELETE /v1/chat/groups/:id/mute should toggle mute', async () => {
      const { email, password } = await createTestUser(app, 'muter');
      const { token } = await loginAndGetToken(app, email, password);

      const group = await request(app.getHttpServer())
        .post('/v1/chat/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Mute Test' })
        .expect(201);

      // Mute
      await request(app.getHttpServer())
        .post(`/v1/chat/groups/${group.body.id}/mute`)
        .set('Authorization', `Bearer ${token}`)
        .send({ duration_minutes: 60 })
        .expect(201);

      // Unmute
      await request(app.getHttpServer())
        .delete(`/v1/chat/groups/${group.body.id}/mute`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});
