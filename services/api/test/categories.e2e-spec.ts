import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';
import {
  createTestUser,
  loginAndGetToken,
  createAdminUser,
} from './utils/test-factories';

describe('Categories Module (e2e)', () => {
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

  describe('GET /v1/categories/listings (public)', () => {
    it('should return 200 without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/categories/listings')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /v1/categories/events (public)', () => {
    it('should return 200 without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/categories/events')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ── Admin write routes ─────────────────────────────────

  describe('POST /v1/categories/listings (admin)', () => {
    let adminToken: string;
    let regularToken: string;

    beforeEach(async () => {
      const admin = await createAdminUser(app, 'cataadmin');
      adminToken = admin.token;

      const { email, password } = await createTestUser(app, 'catauser');
      const result = await loginAndGetToken(app, email, password);
      regularToken = result.token;
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories/listings')
        .send({ category_name: 'Test' })
        .expect(401);
    });

    it('should return 403 for regular user', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories/listings')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ category_name: 'Test' })
        .expect(403);
    });

    it('should create a listing category as admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories/listings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Jardinage' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('categoryName', 'Jardinage');
      expect(res.body).toHaveProperty('parentCategory', null);
    });

    it('should create a child category with valid parent', async () => {
      const parent = await request(app.getHttpServer())
        .post('/v1/categories/listings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Bricolage' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/v1/categories/listings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Plomberie', parent_category: parent.body.id })
        .expect(201);

      expect(res.body.parentCategory).toBe(parent.body.id);
    });

    it('should return 400 for invalid parent', async () => {
      await request(app.getHttpServer())
        .post('/v1/categories/listings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Orphan', parent_category: 99999 })
        .expect(400);
    });

    it('should create an event category as admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/categories/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Conférence' })
        .expect(201);

      expect(res.body).toHaveProperty('categoryName', 'Conférence');
    });
  });

  // ── PATCH ──────────────────────────────────────────────

  describe('PATCH /v1/categories/listings/:id (admin)', () => {
    let adminToken: string;
    let categoryId: number;

    beforeEach(async () => {
      const admin = await createAdminUser(app, 'catpatch');
      adminToken = admin.token;

      const res = await request(app.getHttpServer())
        .post('/v1/categories/listings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Original' })
        .expect(201);
      categoryId = res.body.id;
    });

    it('should rename a category', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/categories/listings/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Renamed' })
        .expect(200);

      expect(res.body.categoryName).toBe('Renamed');
    });

    it('should return 404 for unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/v1/categories/listings/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Nope' })
        .expect(404);
    });

    it('should return 400 for self-reference', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/categories/listings/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ parent_category: categoryId })
        .expect(400);
    });
  });

  // ── DELETE cascade ─────────────────────────────────────

  describe('DELETE /v1/categories/listings/:id (admin)', () => {
    let adminToken: string;
    let parentId: number;
    let childId: number;

    beforeEach(async () => {
      const admin = await createAdminUser(app, 'catdel');
      adminToken = admin.token;

      const parent = await request(app.getHttpServer())
        .post('/v1/categories/listings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Parent' })
        .expect(201);
      parentId = parent.body.id;

      const child = await request(app.getHttpServer())
        .post('/v1/categories/listings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Child', parent_category: parentId })
        .expect(201);
      childId = child.body.id;
    });

    it('should delete category and cascade children', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/categories/listings/${parentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify both are gone
      await request(app.getHttpServer())
        .patch(`/v1/categories/listings/${childId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Ghost' })
        .expect(404);
    });

    it('should return 404 for unknown id', async () => {
      await request(app.getHttpServer())
        .delete('/v1/categories/listings/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ── Tree structure ─────────────────────────────────────

  describe('Category tree hierarchy', () => {
    let adminToken: string;

    beforeEach(async () => {
      const admin = await createAdminUser(app, 'cattree');
      adminToken = admin.token;
    });

    it('should build correct tree from flat categories', async () => {
      // Create a hierarchy: Root > Sub1, Sub2
      const root = await request(app.getHttpServer())
        .post('/v1/categories/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Sports' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/categories/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Football', parent_category: root.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/categories/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category_name: 'Tennis', parent_category: root.body.id })
        .expect(201);

      // GET tree
      const res = await request(app.getHttpServer())
        .get('/v1/categories/events')
        .expect(200);

      // Root should have children
      const tree = res.body;
      expect(tree).toHaveLength(1);
      const rootNode = tree.find((n: any) => n.categoryName === 'Sports');
      expect(rootNode).toBeDefined();
      expect(rootNode.children).toHaveLength(2);

      const childNames = rootNode.children
        .map((c: any) => c.categoryName)
        .sort();
      expect(childNames).toEqual(['Football', 'Tennis']);
    });
  });
});
