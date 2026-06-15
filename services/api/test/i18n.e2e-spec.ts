import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestingApp, clearDatabase, clearRedis } from './utils/e2e-setup';

describe('i18n Module (e2e)', () => {
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

  describe('GET /v1/i18n/languages', () => {
    it('should return 200 with supported languages', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/i18n/languages')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should include French and English', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/i18n/languages')
        .expect(200);

      const codes = res.body.map((l: any) => l.code);
      expect(codes).toContain('fr');
      expect(codes).toContain('en');
    });

    it('each language should have code, name, and flag', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/i18n/languages')
        .expect(200);

      for (const lang of res.body) {
        expect(lang).toHaveProperty('code');
        expect(lang).toHaveProperty('name');
        expect(lang).toHaveProperty('flag');
        expect(typeof lang.code).toBe('string');
        expect(typeof lang.name).toBe('string');
        expect(typeof lang.flag).toBe('string');
      }
    });
  });
});
