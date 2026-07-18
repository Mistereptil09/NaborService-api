import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DslController } from '../dsl.controller';
import { DslService } from '../dsl.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';

const baseResult = {
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
  resultCount: 5,
  results: [],
};

function createMockDslService(): Partial<DslService> {
  return {
    executeQuery: jest.fn().mockImplementation((query: string) => {
      if (query.includes('INVALID_SYNTAX')) {
        throw new BadRequestException(
          "Erreur de syntaxe near 'INVALID_SYNTAX'",
        );
      }
      if (query.includes('users')) {
        throw new ForbiddenException("Collection 'users' non autorisée");
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
        ...baseResult,
        collection,
        filter: { status: 'open' },
        order: orderMatch
          ? { [orderMatch[1]]: orderMatch[2].toUpperCase() === 'ASC' ? 1 : -1 }
          : null,
        limit: limitMatch ? parseInt(limitMatch[1], 10) : 100,
      };
    }),
    logQuery: jest.fn().mockResolvedValue(undefined),
    getAuditHistory: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'audit-1',
          userId: 'admin-id',
          userRole: 'admin',
          query: 'FIND contracts WHERE status = "open" LIMIT 20',
          collection: 'contracts',
          filter: { status: 'open' },
          order: null,
          limit: 20,
          resultCount: 5,
          hasError: false,
          errorMessage: null,
          ipAddress: '127.0.0.1',
          createdAt: new Date('2026-06-16T12:00:00Z'),
        },
      ],
      meta: { total: 1, offset: 0, limit: 50 },
    }),
  };
}

const mockJwtAuthGuard = { canActivate: jest.fn().mockReturnValue(true) };
const mockRolesGuard = { canActivate: jest.fn().mockReturnValue(true) };

describe('DslController', () => {
  let controller: DslController;
  let mockService: Partial<DslService>;

  beforeEach(async () => {
    mockService = createMockDslService();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DslController],
      providers: [{ provide: DslService, useValue: mockService }, Reflector],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get(DslController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('executeQuery', () => {
    const mockRequest = (
      overrides: Partial<{ sub: string; role: string; ip: string }> = {},
    ) =>
      ({
        user: {
          sub: overrides.sub ?? 'user-1',
          role: overrides.role ?? 'moderator',
        },
        ip: overrides.ip ?? '127.0.0.1',
      }) as any;

    it('should execute a query on contracts and return results', async () => {
      const result = await controller.executeQuery(
        'FIND contracts WHERE status = "open" LIMIT 20',
        mockRequest(),
      );

      expect(result.collection).toBe('contracts');
      expect(result.filter).toEqual({ status: 'open' });
      expect(result.limit).toBe(20);
      expect(result.resultCount).toBe(5);
      expect(result.results).toEqual([]);
      expect(result.projection).toHaveProperty('content_encrypted', 0);
    });

    it('should execute a query on messages with ORDER BY and LIMIT', async () => {
      const result = await controller.executeQuery(
        'SELECT messages WHERE group_id = "abc" ORDER BY sent_at DESC LIMIT 50',
        mockRequest(),
      );

      expect(result.collection).toBe('messages');
      expect(result.limit).toBe(50);
      expect(result.order).toEqual({ sent_at: -1 });
    });

    it('should execute a query on event_tickets with IS NULL', async () => {
      const result = await controller.executeQuery(
        'GET event_tickets WHERE scanned_at IS NULL ORDER BY issued_at ASC LIMIT 100',
        mockRequest(),
      );

      expect(result.collection).toBe('event_tickets');
      expect(result.limit).toBe(100);
      expect(result.order).toEqual({ issued_at: 1 });
    });

    it('should default to limit 100 when no LIMIT clause', async () => {
      const result = await controller.executeQuery(
        'FIND contracts',
        mockRequest(),
      );

      expect(result.limit).toBe(100);
    });

    it('should throw 400 for invalid DSL syntax', async () => {
      await expect(
        controller.executeQuery('FIND INVALID_SYNTAX contracts', mockRequest()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw 403 for unauthorized collection', async () => {
      await expect(
        controller.executeQuery('FIND users LIMIT 10', mockRequest()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw 500 when DSL service is down', async () => {
      await expect(
        controller.executeQuery('FIND DSL_DOWN LIMIT 10', mockRequest()),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should log audit with resultCount', async () => {
      await controller.executeQuery(
        'FIND contracts LIMIT 10',
        mockRequest({ sub: 'user-1', role: 'moderator' }),
      );

      expect(mockService.logQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          userRole: 'moderator',
          collection: 'contracts',
          hasError: false,
          resultCount: 5,
        }),
      );
    });

    it('should log audit for failed query', async () => {
      try {
        await controller.executeQuery('FIND users LIMIT 10', mockRequest());
      } catch {}

      expect(mockService.logQuery).toHaveBeenCalledWith(
        expect.objectContaining({ hasError: true }),
      );
    });
  });

  describe('getAudit', () => {
    it('should return paginated audit history', async () => {
      const result = await controller.getAudit({ offset: 0, limit: 50 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta.total', 1);
      expect(result.data[0].resultCount).toBe(5);
    });

    it('should pass pagination params', async () => {
      await controller.getAudit({ offset: 10, limit: 25 });

      expect(mockService.getAuditHistory).toHaveBeenCalledWith(10, 25);
    });

    it('defaults offset to 0 and limit to 50 via the DTO defaults', async () => {
      await controller.getAudit({ offset: 0, limit: 50 });

      expect(mockService.getAuditHistory).toHaveBeenCalledWith(0, 50);
    });
  });
});
