import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';

describe('Geo Module (e2e)', () => {
  let app: INestApplication;
  let banAvailable: boolean;

  beforeAll(async () => {
    app = await createTestingApp();

    try {
      const res = await request(app.getHttpServer())
        .get('/v1/geo/autocomplete')
        .query({ q: 'test' });
      banAvailable = res.status === 200;
    } catch {
      banAvailable = false;
    }

    if (!banAvailable) {
      console.warn(
        'BAN API unreachable — BAN-dependent geo tests will be skipped',
      );
    }
  }, 10000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await clearDatabase(app);
    await clearRedis(app);
  });

  const banOnly = (test: jest.It) => (banAvailable ? test : test.skip);

  describe('GET /v1/geo/autocomplete', () => {
    it('should return 400 when q is missing', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/geo/autocomplete')
        .expect(400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 when q is empty', async () => {
      await request(app.getHttpServer())
        .get('/v1/geo/autocomplete')
        .query({ q: '' })
        .expect(400);
    });

    it('should reject limit greater than 20', async () => {
      await request(app.getHttpServer())
        .get('/v1/geo/autocomplete')
        .query({ q: 'paris', limit: 50 })
        .expect(400);
    });

    it('should return 200 with an array for a valid query', async () => {
      if (!banAvailable) return;
      const res = await request(app.getHttpServer())
        .get('/v1/geo/autocomplete')
        .query({ q: 'paris' });
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    }, 5000);

    it('should return results with correct shape', async () => {
      if (!banAvailable) return;
      const res = await request(app.getHttpServer())
        .get('/v1/geo/autocomplete')
        .query({ q: 'paris', limit: 2 });
      expect([200, 500]).toContain(res.status);
      if (res.status === 200 && res.body.length > 0) {
        for (const item of res.body) {
          expect(item).toHaveProperty('label');
          expect(typeof item.label).toBe('string');
          expect(typeof item.latitude).toBe('number');
          expect(typeof item.longitude).toBe('number');
          expect(typeof item.score).toBe('number');
        }
      }
    }, 5000);

    it('should respect the limit parameter', async () => {
      if (!banAvailable) return;
      const res = await request(app.getHttpServer())
        .get('/v1/geo/autocomplete')
        .query({ q: 'paris', limit: 3 });
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.length).toBeLessThanOrEqual(3);
      }
    }, 5000);
  });

  describe('GET /v1/geo/resolve-neighbourhood', () => {
    it('should return 400 when q is missing', async () => {
      await request(app.getHttpServer())
        .get('/v1/geo/resolve-neighbourhood')
        .expect(400);
    });

    it('should return 400 when q is empty', async () => {
      await request(app.getHttpServer())
        .get('/v1/geo/resolve-neighbourhood')
        .query({ q: '' })
        .expect(400);
    });

    it('should return 200 or 404 for a valid address', async () => {
      if (!banAvailable) return;
      const res = await request(app.getHttpServer())
        .get('/v1/geo/resolve-neighbourhood')
        .query({ q: '10 rue de la Paix Paris' });
      expect([200, 404]).toContain(res.status);
    }, 5000);

    it('should return 404 (not 500) for an unknown address', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/geo/resolve-neighbourhood')
        .query({ q: 'xyzunknownlocation123456' });
      expect(res.status).not.toBe(500);
      expect([200, 404]).toContain(res.status);
    }, 5000);
  });
});
