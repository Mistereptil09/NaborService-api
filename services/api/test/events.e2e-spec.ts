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
  createEvent,
} from './utils/test-factories';

describe('Events Module (e2e)', () => {
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

  // ── CRUD ─────────────────────────────────────────────────────

  describe('CRUD', () => {
    it('POST /v1/events should create a draft event', async () => {
      const { email, password } = await createTestUser(app, 'creator');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .post('/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Summer Party',
          description: 'A great event',
          cost_cents: 500,
          max_participants: 50,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('title', 'Summer Party');
      expect(res.body).toHaveProperty('status', 'draft');
      expect(res.body).toHaveProperty('costCents', 500);
    });

    it('GET /v1/events should list events', async () => {
      const { email, password } = await createTestUser(app, 'lister');
      const { token } = await loginAndGetToken(app, email, password);

      await createEvent(app, token, { title: 'Event 1' });
      await createEvent(app, token, { title: 'Event 2' });

      const res = await request(app.getHttpServer())
        .get('/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('GET /v1/events/:id should return a single event', async () => {
      const { email, password } = await createTestUser(app, 'getter');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await createEvent(app, token, { title: 'My Event' });

      const res = await request(app.getHttpServer())
        .get(`/v1/events/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', created.id);
      expect(res.body).toHaveProperty('title', 'My Event');
    });

    it('GET /v1/events/:id should return 404 for non-existent', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/events/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('PATCH /v1/events/:id should update own event', async () => {
      const { email, password } = await createTestUser(app, 'updater');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await createEvent(app, token, { title: 'Original' });

      const res = await request(app.getHttpServer())
        .patch(`/v1/events/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Event', cost_cents: 1000 })
        .expect(200);

      expect(res.body).toHaveProperty('title', 'Updated Event');
      expect(res.body).toHaveProperty('costCents', 1000);
    });

    it('PATCH /v1/events/:id should return 403 for non-owner', async () => {
      const user1 = await createTestUser(app, 'owner');
      const user2 = await createTestUser(app, 'intruder');
      const { token: token1 } = await loginAndGetToken(app, user1.email, user1.password);
      const { token: token2 } = await loginAndGetToken(app, user2.email, user2.password);

      const created = await createEvent(app, token1);

      await request(app.getHttpServer())
        .patch(`/v1/events/${created.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ title: 'Hacked' })
        .expect(403);
    });

    it('DELETE /v1/events/:id should soft-delete own event', async () => {
      const { email, password } = await createTestUser(app, 'deleter');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await createEvent(app, token);

      await request(app.getHttpServer())
        .delete(`/v1/events/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  // ── State Machine ────────────────────────────────────────────

  describe('State Machine', () => {
    it('should flow: draft → published → open → completed', async () => {
      const { email, password } = await createTestUser(app, 'sm');
      const { token } = await loginAndGetToken(app, email, password);

      const event = await createEvent(app, token, { title: 'Lifecycle' });
      expect(event.status).toBe('draft');

      // publish
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // open
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/open`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // complete
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should cancel an event', async () => {
      const { email, password } = await createTestUser(app, 'canceller');
      const { token } = await loginAndGetToken(app, email, password);

      const event = await createEvent(app, token);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Weather issues' })
        .expect(200);
    });

    it('should return 400 when cancelling without reason', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      const event = await createEvent(app, token);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: '' })
        .expect(400);
    });

    it('should return 403 when non-owner tries to publish', async () => {
      const user1 = await createTestUser(app, 'owner');
      const user2 = await createTestUser(app, 'other');
      const { token: token1 } = await loginAndGetToken(app, user1.email, user1.password);
      const { token: token2 } = await loginAndGetToken(app, user2.email, user2.password);

      const event = await createEvent(app, token1);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);
    });
  });

  // ── Registration ─────────────────────────────────────────────

  describe('Registration', () => {
    it('POST /v1/events/:id/register should return 202 for an open event', async () => {
      const { email, password } = await createTestUser(app, 'creator');
      const { token } = await loginAndGetToken(app, email, password);

      const event = await createEvent(app, token);
      // Publish and open
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${token}`);
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/open`)
        .set('Authorization', `Bearer ${token}`);

      // Another user registers
      const user2 = await createTestUser(app, 'joiner');
      const { token: token2 } = await loginAndGetToken(app, user2.email, user2.password);

      const res = await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/register`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(202);

      expect(res.body).toHaveProperty('success', true);
    });

    it('POST /v1/events/:id/register should return 409 if event is not open', async () => {
      const { email, password } = await createTestUser(app, 'creator');
      const { token } = await loginAndGetToken(app, email, password);

      const event = await createEvent(app, token);
      // Event is still draft

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/register`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });
  });

  // ── Swipe ────────────────────────────────────────────────────

  describe('Swipe', () => {
    it('POST /v1/events/:id/swipe should record a like', async () => {
      const creator = await createTestUser(app, 'creator');
      const swiper = await createTestUser(app, 'swiper');
      const { token: creatorToken } = await loginAndGetToken(app, creator.email, creator.password);
      const { token: swiperToken } = await loginAndGetToken(app, swiper.email, swiper.password);

      const event = await createEvent(app, creatorToken);

      // Publish so it's visible
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${creatorToken}`);

      const res = await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/swipe`)
        .set('Authorization', `Bearer ${swiperToken}`)
        .send({ direction: 'like' })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });

    it('POST /v1/events/:id/swipe should return 400 for invalid direction', async () => {
      const { email, password } = await createTestUser(app, 'creator');
      const { token } = await loginAndGetToken(app, email, password);

      const event = await createEvent(app, token);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/swipe`)
        .set('Authorization', `Bearer ${token}`)
        .send({ direction: 'invalid' })
        .expect(400);
    });
  });

  // ── Report ───────────────────────────────────────────────────

  describe('Report', () => {
    it('POST /v1/events/:id/report should report an event', async () => {
      const owner = await createTestUser(app, 'owner');
      const reporter = await createTestUser(app, 'reporter');
      const { token: ownerToken } = await loginAndGetToken(app, owner.email, owner.password);
      const { token: reporterToken } = await loginAndGetToken(app, reporter.email, reporter.password);

      const event = await createEvent(app, ownerToken);

      const res = await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: 'Suspicious event' })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });

    it('POST /v1/events/:id/report should return 400 with empty reason', async () => {
      const owner = await createTestUser(app, 'owner2');
      const reporter = await createTestUser(app, 'reporter2');
      const { token: ownerToken } = await loginAndGetToken(app, owner.email, owner.password);
      const { token: reporterToken } = await loginAndGetToken(app, reporter.email, reporter.password);

      const event = await createEvent(app, ownerToken);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: '' })
        .expect(400);
    });
  });

  // ── Auth ─────────────────────────────────────────────────────

  describe('Auth', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/v1/events')
        .expect(401);
    });
  });
});
