import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { DslService } from '../src/modules/dsl/dsl.service';
import { clearDatabase, clearRedis } from './utils/e2e-setup';
import {
  createTestUser,
  loginAndGetToken,
  createAdminUser,
  createModeratorUser,
} from './utils/test-factories';

// ── Mock DslService ──────────────────────────────────────────
const mockParseQuery = jest.fn();
const mockLogQuery = jest.fn();
const mockGetAuditHistory = jest.fn();

const mockDslService = {
  parseQuery: mockParseQuery,
  logQuery: mockLogQuery,
  getAuditHistory: mockGetAuditHistory,
};

function setupMockForQuery(query: string) {
  const { BadRequestException, ForbiddenException, InternalServerErrorException } =
    require('@nestjs/common');

  if (query.includes('INVALID_SYNTAX')) {
    throw new BadRequestException("Erreur de syntaxe near 'INVALID_SYNTAX'");
  }
  if (query.includes('users')) {
    throw new ForbiddenException("Collection 'users' non autoris�e");
  }
  if (query.includes('DSL_DOWN')) {
    throw new InternalServerErrorException('Service DSL indisponible');
  }

  const collection = query.includes('contracts')
    ? 'contracts'
    : query.includes('messages')
      ? 'messages'
      : query.includes('event_tickets')
        ? 'event_tickets'
        : query.includes('listing_documents')
          ? 'listing_documents'
          : query.includes('event_documents')
            ? 'event_documents'
            : 'incident_documents';

  const orderMatch = query.match(/ORDER\s+BY\s+(\S+)\s+(ASC|DESC)/i);
  const limitMatch = query.match(/LIMIT\s+(\d+)/i);

  return {
    collection,
    filter: { status: 'open' },
    order: orderMatch
      ? { [orderMatch[1]]: orderMatch[2].toUpperCase() === 'ASC' ? 1 : -1 }
      : null,
    limit: limitMatch ? parseInt(limitMatch[1], 10) : 100,
    projection: {
      content_encrypted: 0,
      iv: 0,
      auth_tag: 0,
      data: 0,
      'pdf.data': 0,
      qr_png: 0,
      'signature.canvas_b64': 0,
      'signature.signed_ip': 0,
    },
  };
}

describe('DSL Module (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    mockParseQuery.mockImplementation((q: string) => setupMockForQuery(q));
    mockLogQuery.mockResolvedValue(undefined);
    mockGetAuditHistory.mockResolvedValue({
      entries: [{
        id: 'audit-1', userId: 'admin-id', userRole: 'admin',
        query: 'FIND IN contracts WHERE status = "open" LIMIT 20',
        collection: 'contracts', filter: { status: 'open' }, order: null,
        limit: 20, resultCount: null, hasError: false, errorMessage: null,
        ipAddress: '127.0.0.1', createdAt: new Date('2026-06-16T12:00:00Z'),
      }],
      total: 1,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DslService)
      .useValue(mockDslService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    await clearRedis(app);
    jest.clearAllMocks();
  });

  // ── Auth guards ─────────────────────────────────────────

  it('POST /v1/dsl/query should return 401 without token', async () => {
    await request(app.getHttpServer())
      .post('/v1/dsl/query')
      .send({ query: 'FIND IN contracts LIMIT 10' })
      .expect(401);
  });

  it('GET /v1/dsl/audit should return 401 without token', async () => {
    await request(app.getHttpServer())
      .get('/v1/dsl/audit')
      .expect(401);
  });

  // ── Role guards ─────────────────────────────────────────

  it('POST /v1/dsl/query should return 403 for resident', async () => {
    const { email, password } = await createTestUser(app, 'dslresident');
    const { token } = await loginAndGetToken(app, email, password);

    await request(app.getHttpServer())
      .post('/v1/dsl/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'FIND IN contracts LIMIT 10' })
      .expect(403);
  });

  it('GET /v1/dsl/audit should return 403 for moderator', async () => {
    const mod = await createModeratorUser(app, 'dslmodaudit');

    await request(app.getHttpServer())
      .get('/v1/dsl/audit')
      .set('Authorization', `Bearer ${mod.token}`)
      .expect(403);
  });

  // ── POST /dsl/query — Moderator ─────────────────────────

  describe('POST /v1/dsl/query (moderator)', () => {
    let modToken: string;

    beforeEach(async () => {
      const mod = await createModeratorUser(app, 'dslmod');
      modToken = mod.token;
    });

    it('should parse a valid DSL query', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/dsl/query')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ query: 'FIND IN contracts WHERE status = "open" LIMIT 20' })
        .expect(200);

      expect(res.body).toHaveProperty('collection', 'contracts');
      expect(res.body).toHaveProperty('filter');
      expect(res.body).toHaveProperty('limit', 20);
      expect(res.body).toHaveProperty('projection');
      expect(res.body.projection['signature.canvas_b64']).toBe(0);
      expect(res.body.projection['pdf.data']).toBe(0);
    });

    it('should parse all 6 authorized collections', async () => {
      const collections = [
        'contracts',
        'messages',
        'event_tickets',
        'listing_documents',
        'event_documents',
        'incident_documents',
      ];
      for (const col of collections) {
        const res = await request(app.getHttpServer())
          .post('/v1/dsl/query')
          .set('Authorization', `Bearer ${modToken}`)
          .send({ query: `FIND IN ${col} LIMIT 10` })
          .expect(200);
        expect(res.body.collection).toBe(col);
      }
    });

    it('should extract ORDER BY and LIMIT from query', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/dsl/query')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ query: 'FIND IN event_tickets WHERE scanned_at IS NULL ORDER BY issued_at ASC LIMIT 100' })
        .expect(200);

      expect(res.body.collection).toBe('event_tickets');
      expect(res.body.order).toEqual({ issued_at: 1 });
      expect(res.body.limit).toBe(100);
    });

    it('should return 400 for invalid DSL syntax', async () => {
      await request(app.getHttpServer())
        .post('/v1/dsl/query')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ query: 'FIND INVALID_SYNTAX IN contracts' })
        .expect(400);
    });

    it('should return 403 for unauthorized collection', async () => {
      await request(app.getHttpServer())
        .post('/v1/dsl/query')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ query: 'FIND IN users LIMIT 10' })
        .expect(403);
    });

    it('should return 500 when DSL service is down', async () => {
      await request(app.getHttpServer())
        .post('/v1/dsl/query')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ query: 'FIND IN DSL_DOWN LIMIT 10' })
        .expect(500);
    });

    it('should log audit for successful and failed queries', async () => {
      // Success
      await request(app.getHttpServer())
        .post('/v1/dsl/query')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ query: 'FIND IN contracts LIMIT 10' })
        .expect(200);

      expect(mockLogQuery).toHaveBeenCalledWith(
        expect.objectContaining({ hasError: false }),
      );

      // Failure
      try {
        await request(app.getHttpServer())
          .post('/v1/dsl/query')
          .set('Authorization', `Bearer ${modToken}`)
          .send({ query: 'FIND IN users LIMIT 10' });
      } catch {}

      expect(mockLogQuery).toHaveBeenCalledWith(
        expect.objectContaining({ hasError: true }),
      );
    });
  });

  // ── POST /dsl/query — Admin ─────────────────────────────

  describe('POST /v1/dsl/query (admin)', () => {
    let adminToken: string;

    beforeEach(async () => {
      const admin = await createAdminUser(app, 'dsladmin');
      adminToken = admin.token;
    });

    it('should parse a valid DSL query as admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/dsl/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: 'FIND IN contracts WHERE signed_at IS NOT NULL LIMIT 10' })
        .expect(200);

      expect(res.body.collection).toBe('contracts');
    });
  });

  // ── GET /dsl/audit — Admin ──────────────────────────────

  describe('GET /v1/dsl/audit (admin)', () => {
    let adminToken: string;

    beforeEach(async () => {
      const admin = await createAdminUser(app, 'dslauditadmin');
      adminToken = admin.token;
    });

    it('should return audit history with entries', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/dsl/audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('entries');
      expect(res.body).toHaveProperty('total', 1);
      expect(res.body.entries[0]).toHaveProperty('query');
      expect(res.body.entries[0]).toHaveProperty('collection', 'contracts');
      expect(res.body.entries[0]).toHaveProperty('userId', 'admin-id');
      expect(mockGetAuditHistory).toHaveBeenCalledWith(0, 50);
    });

    it('should support pagination', async () => {
      await request(app.getHttpServer())
        .get('/v1/dsl/audit?offset=10&limit=25')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(mockGetAuditHistory).toHaveBeenCalledWith(10, 25);
    });
  });
});
