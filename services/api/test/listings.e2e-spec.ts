import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestingApp,
  clearDatabase,
  clearRedis,
  clearQueueJobs,
} from './utils/e2e-setup';
import {
  createTestUser,
  loginAndGetToken,
  createListing,
} from './utils/test-factories';

describe('Listings Module (e2e)', () => {
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

  afterEach(async () => {
    await clearQueueJobs(app);
  });

  // ── CRUD ─────────────────────────────────────────────────────

  describe('CRUD', () => {
    it('POST /v1/listings should create a listing', async () => {
      const { email, password } = await createTestUser(app, 'creator');
      const { token } = await loginAndGetToken(app, email, password);

      const res = await request(app.getHttpServer())
        .post('/v1/listings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Listing',
          listing_type: 'offer',
          description: 'A great offer',
          price_cents: 1500,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('title', 'Test Listing');
      expect(res.body).toHaveProperty('listingType', 'offer');
      expect(res.body).toHaveProperty('status', 'open');
      expect(res.body).toHaveProperty('priceCents', 1500);
    });

    it('POST /v1/listings should return 400 with missing title', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .post('/v1/listings')
        .set('Authorization', `Bearer ${token}`)
        .send({ listing_type: 'offer' })
        .expect(400);
    });

    it('GET /v1/listings should return paginated listings', async () => {
      const { email, password } = await createTestUser(app, 'lister');
      const { token } = await loginAndGetToken(app, email, password);

      await createListing(app, token, { title: 'Listing 1' });
      await createListing(app, token, { title: 'Listing 2' });

      const res = await request(app.getHttpServer())
        .get('/v1/listings')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /v1/listings/:id should return a single listing', async () => {
      const { email, password } = await createTestUser(app, 'getter');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await createListing(app, token, { title: 'My Listing' });

      const res = await request(app.getHttpServer())
        .get(`/v1/listings/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', created.id);
      expect(res.body).toHaveProperty('title', 'My Listing');
    });

    it('GET /v1/listings/:id should return 404 for non-existent listing', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      await request(app.getHttpServer())
        .get('/v1/listings/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('PATCH /v1/listings/:id should update own listing', async () => {
      const { email, password } = await createTestUser(app, 'updater');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await createListing(app, token, { title: 'Original' });

      const res = await request(app.getHttpServer())
        .patch(`/v1/listings/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated Title', price_cents: 2000 })
        .expect(200);

      expect(res.body).toHaveProperty('title', 'Updated Title');
      expect(res.body).toHaveProperty('priceCents', 2000);
    });

    it('PATCH /v1/listings/:id should return 403 for non-owner', async () => {
      const user1 = await createTestUser(app, 'owner');
      const user2 = await createTestUser(app, 'intruder');
      const { token: token1 } = await loginAndGetToken(app, user1.email, user1.password);
      const { token: token2 } = await loginAndGetToken(app, user2.email, user2.password);

      const created = await createListing(app, token1);

      await request(app.getHttpServer())
        .patch(`/v1/listings/${created.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ title: 'Hacked' })
        .expect(403);
    });

    it('DELETE /v1/listings/:id should soft-delete own listing', async () => {
      const { email, password } = await createTestUser(app, 'deleter');
      const { token } = await loginAndGetToken(app, email, password);

      const created = await createListing(app, token);

      const res = await request(app.getHttpServer())
        .delete(`/v1/listings/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);

      // Should now be 404
      await request(app.getHttpServer())
        .get(`/v1/listings/${created.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ── State Machine ────────────────────────────────────────────

  describe('State Machine', () => {
    it('should complete the full lifecycle: open → pending → in_progress → closed', async () => {
      // Setup two users
      const creator = await createTestUser(app, 'creator');
      const requester = await createTestUser(app, 'requester');
      const { token: creatorToken } = await loginAndGetToken(app, creator.email, creator.password);
      const { token: requesterToken } = await loginAndGetToken(app, requester.email, requester.password);

      // 1. Creator creates a listing → OPEN
      const listing = await createListing(app, creatorToken, { title: 'Lifecycle Test' });
      expect(listing.status).toBe('open');

      // 2. Requester expresses interest → PENDING
      const interestRes = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/interest`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(201);

      expect(interestRes.body.listing).toHaveProperty('status', 'pending');
      const transactionId = interestRes.body.transaction.id;

      // 3. Creator accepts → IN_PROGRESS
      const acceptRes = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/accept`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(201);

      expect(acceptRes.body).toHaveProperty('status', 'in_progress');

      // 4. Both parties confirm → CLOSED
      await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/confirm`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(201);

      const confirmRes = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/confirm`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .expect(201);

      expect(confirmRes.body).toHaveProperty('status', 'completed');
    });

    it('POST /v1/listings/:id/interest should fail for own listing', async () => {
      const { email, password } = await createTestUser(app, 'self');
      const { token } = await loginAndGetToken(app, email, password);

      const listing = await createListing(app, token);

      await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/interest`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('POST /v1/listings/:id/cancel should cancel an open listing', async () => {
      const { email, password } = await createTestUser(app, 'canceller');
      const { token } = await loginAndGetToken(app, email, password);

      const listing = await createListing(app, token);

      const res = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'No longer needed' })
        .expect(201);

      expect(res.body).toHaveProperty('status', 'cancelled');
    });

    it('POST /v1/listings/:id/cancel should return 400 without reason', async () => {
      const { email, password } = await createTestUser(app);
      const { token } = await loginAndGetToken(app, email, password);

      const listing = await createListing(app, token);

      await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: '' })
        .expect(400);
    });

    it('POST /v1/listings/:id/accept should fail for non-creator', async () => {
      const creator = await createTestUser(app, 'creator');
      const other = await createTestUser(app, 'other');
      const { token: creatorToken } = await loginAndGetToken(app, creator.email, creator.password);
      const { token: otherToken } = await loginAndGetToken(app, other.email, other.password);

      // Creator makes listing, other expresses interest
      const listing = await createListing(app, creatorToken);
      await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/interest`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(201);

      // Other tries to accept (should fail — only creator can accept)
      await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/accept`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });
  });

  // ── Report ───────────────────────────────────────────────────

  describe('Report', () => {
    it('POST /v1/listings/:id/report should report a listing', async () => {
      const owner = await createTestUser(app, 'owner');
      const reporter = await createTestUser(app, 'reporter');
      const { token: ownerToken } = await loginAndGetToken(app, owner.email, owner.password);
      const { token: reporterToken } = await loginAndGetToken(app, reporter.email, reporter.password);

      const listing = await createListing(app, ownerToken);

      const res = await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: 'Inappropriate content' })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
    });

    it('POST /v1/listings/:id/report should return 400 with empty reason', async () => {
      const owner = await createTestUser(app, 'owner2');
      const reporter = await createTestUser(app, 'reporter2');
      const { token: ownerToken } = await loginAndGetToken(app, owner.email, owner.password);
      const { token: reporterToken } = await loginAndGetToken(app, reporter.email, reporter.password);

      const listing = await createListing(app, ownerToken);

      await request(app.getHttpServer())
        .post(`/v1/listings/${listing.id}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: '' })
        .expect(400);
    });
  });

  // ── Auth Guards ──────────────────────────────────────────────

  describe('Auth', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/v1/listings')
        .expect(401);
    });

    it('should return 401 for invalid token', async () => {
      await request(app.getHttpServer())
        .get('/v1/listings')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);
    });
  });
});
