import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestingApp,
  clearDatabase,
  clearRedis,
  clearQueueJobs,
  waitForQueueJob,
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
    if (app) await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    await clearRedis(app);
  });

  afterEach(async () => {
    await clearQueueJobs(app);
  });

  // ── CRUD ───────────────────────────────────────────────────

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
      expect(res.body).toHaveProperty('status', 'draft');
    });

    it('GET /v1/events should list events', async () => {
      const { email, password } = await createTestUser(app, 'lister');
      const { token } = await loginAndGetToken(app, email, password);
      await createEvent(app, token);

      const res = await request(app.getHttpServer())
        .get('/v1/events')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
    });

    it('GET /v1/events/:id should return single event', async () => {
      const { email, password } = await createTestUser(app, 'getter');
      const { token } = await loginAndGetToken(app, email, password);
      const created = await createEvent(app, token);

      const res = await request(app.getHttpServer())
        .get(`/v1/events/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', created.id);
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
      const created = await createEvent(app, token);

      const res = await request(app.getHttpServer())
        .patch(`/v1/events/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Event' })
        .expect(200);
      expect(res.body).toHaveProperty('title', 'Updated Event');
    });

    it('PATCH /v1/events/:id should return 403 for non-owner', async () => {
      const u1 = await createTestUser(app, 'owner');
      const u2 = await createTestUser(app, 'intruder');
      const { token: t1 } = await loginAndGetToken(app, u1.email, u1.password);
      const { token: t2 } = await loginAndGetToken(app, u2.email, u2.password);
      const created = await createEvent(app, t1);

      await request(app.getHttpServer())
        .patch(`/v1/events/${created.id}`)
        .set('Authorization', `Bearer ${t2}`)
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

  // ── State Machine ──────────────────────────────────────────

  describe('State Machine', () => {
    it('should flow: draft → published → open → completed', async () => {
      const { email, password } = await createTestUser(app, 'sm');
      const { token } = await loginAndGetToken(app, email, password);
      const event = await createEvent(app, token);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/open`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
    });

    it('should cancel an event', async () => {
      const { email, password } = await createTestUser(app, 'canceller');
      const { token } = await loginAndGetToken(app, email, password);
      const event = await createEvent(app, token);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Weather issues' })
        .expect(201);
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
      const u1 = await createTestUser(app, 'owner');
      const u2 = await createTestUser(app, 'other');
      const { token: t1 } = await loginAndGetToken(app, u1.email, u1.password);
      const { token: t2 } = await loginAndGetToken(app, u2.email, u2.password);
      const event = await createEvent(app, t1);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${t2}`)
        .expect(403);
    });
  });

  // ── Registration ───────────────────────────────────────────

  describe('Registration', () => {
    it('POST /v1/events/:id/register should register participant for a free open event', async () => {
      const u1 = await createTestUser(app, 'creator');
      const u2 = await createTestUser(app, 'joiner');
      const { token: t1 } = await loginAndGetToken(app, u1.email, u1.password);
      const { token: t2 } = await loginAndGetToken(app, u2.email, u2.password);
      const event = await createEvent(app, t1, { cost_cents: 0 });
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${t1}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/open`)
        .set('Authorization', `Bearer ${t1}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/register`)
        .set('Authorization', `Bearer ${t2}`)
        .expect(202);
      expect(res.body).toHaveProperty('success', true);

      // Wait for the async worker to persist the registration
      const job = await waitForQueueJob(app, 'event-register', `${event.id}_${u2.user.id}`);
      expect(job).toBeDefined();
      expect(await job!.isCompleted()).toBe(true);

      // Verify the participant is actually persisted
      const participantsRes = await request(app.getHttpServer())
        .get(`/v1/events/${event.id}/participants`)
        .set('Authorization', `Bearer ${t1}`)
        .expect(200);
      expect(participantsRes.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: u2.user.id }),
        ]),
      );
    });

    it('POST /v1/events/:id/register should return 409 when user has insufficient points', async () => {
      const u1 = await createTestUser(app, 'creator');
      const u2 = await createTestUser(app, 'joiner');
      const { token: t1 } = await loginAndGetToken(app, u1.email, u1.password);
      const { token: t2 } = await loginAndGetToken(app, u2.email, u2.password);
      const event = await createEvent(app, t1, { cost_cents: 500 });
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${t1}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/open`)
        .set('Authorization', `Bearer ${t1}`)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/register`)
        .set('Authorization', `Bearer ${t2}`)
        .expect(409);
    });

    it('POST /v1/events/:id/register should return 409 for draft event', async () => {
      const { email, password } = await createTestUser(app, 'creator');
      const { token } = await loginAndGetToken(app, email, password);
      const event = await createEvent(app, token);
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/register`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);
    });
  });

  // ── Swipe ──────────────────────────────────────────────────

  describe('Swipe', () => {
    it('POST /v1/events/:id/swipe should record a like', async () => {
      const creator = await createTestUser(app, 'creator');
      const swiper = await createTestUser(app, 'swiper');
      const { token: ct } = await loginAndGetToken(
        app,
        creator.email,
        creator.password,
      );
      const { token: st } = await loginAndGetToken(
        app,
        swiper.email,
        swiper.password,
      );
      const event = await createEvent(app, ct);
      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/publish`)
        .set('Authorization', `Bearer ${ct}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/swipe`)
        .set('Authorization', `Bearer ${st}`)
        .send({ direction: 'like' })
        .expect(201);
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

  // ── Report ─────────────────────────────────────────────────

  describe('Report', () => {
    it('POST /v1/events/:id/report should report an event', async () => {
      const owner = await createTestUser(app, 'owner');
      const reporter = await createTestUser(app, 'reporter');
      const { token: ot } = await loginAndGetToken(
        app,
        owner.email,
        owner.password,
      );
      const { token: rt } = await loginAndGetToken(
        app,
        reporter.email,
        reporter.password,
      );
      const event = await createEvent(app, ot);

      const res = await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/report`)
        .set('Authorization', `Bearer ${rt}`)
        .send({ reason: 'Suspicious event' })
        .expect(201);
      expect(res.body).toHaveProperty('success', true);
    });

    it('POST /v1/events/:id/report should return 400 with empty reason', async () => {
      const owner = await createTestUser(app, 'owner2');
      const reporter = await createTestUser(app, 'reporter2');
      const { token: ot } = await loginAndGetToken(
        app,
        owner.email,
        owner.password,
      );
      const { token: rt } = await loginAndGetToken(
        app,
        reporter.email,
        reporter.password,
      );
      const event = await createEvent(app, ot);

      await request(app.getHttpServer())
        .post(`/v1/events/${event.id}/report`)
        .set('Authorization', `Bearer ${rt}`)
        .send({ reason: '' })
        .expect(400);
    });
  });

  // ── Auth ───────────────────────────────────────────────────

  describe('Auth', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/v1/events').expect(401);
    });
  });
});
