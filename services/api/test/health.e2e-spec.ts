import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';

describe('Health Module (e2e)', () => {
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

  describe('GET /v1/health', () => {
    it('should return 200 with status ok', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/health')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
    });

    it('should return a valid ISO timestamp', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/health')
        .expect(200);

      const parsed = new Date(res.body.timestamp);
      expect(parsed.toISOString()).toBe(res.body.timestamp);
    });

    it('should return a positive numeric uptime', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/health')
        .expect(200);

      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /v1/health/ready', () => {
    it('should return readiness status (200 or 503)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/health/ready');

      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
    });
  });
});
