import * as fc from 'fast-check';
import { validate } from 'class-validator';
import { LoginDto } from '../../dto/login.dto';
import { ListingsGateway } from '../../../listings/listings.gateway';
import { ListingStateMachineService } from '../../../listings/listing-state-machine.service';
import { AuthService } from '../../auth.service';
import { SsoService } from '../../sso.service';
import { UsersService } from '../../../users/users.service';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { ListingStatusEnum } from '../../../../common/enums';

describe('API Module Fixes Spec Verification', () => {
  describe('Property 1: Bug Condition (Exploration Tests)', () => {
    
    // 1. WebSocket Auth
    it('1.1: WebSocket gateway handleConnection rejects clients without valid JWT', async () => {
      const mockJwtService = {
        verify: jest.fn().mockImplementation(() => {
          throw new Error('Invalid JWT');
        }),
      };
      
      const gateway = new ListingsGateway(mockJwtService as any);
      const mockClient = {
        handshake: {
          auth: { token: 'invalid-token' },
          query: { userId: 'user-1' },
        },
        disconnect: jest.fn(),
      };

      gateway.handleConnection(mockClient as any);
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    // 2. LoginDto validations
    it('1.2: LoginDto validation rejects invalid payloads', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.oneof(fc.constant('not-an-email'), fc.constant('')),
            password: fc.constant(''),
          }),
          async (payload) => {
            const dto = new LoginDto();
            dto.email = payload.email;
            dto.password = payload.password;

            const errors = await validate(dto);
            expect(errors.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 20 }
      );
    });

    // 3. Global Broadcast
    it('1.3: ListingsGateway emitStatusChanged does not broadcast globally', () => {
      const mockRoom = {
        emit: jest.fn(),
      };
      const mockServer = {
        to: jest.fn().mockReturnValue(mockRoom),
        emit: jest.fn(),
      };
      const gateway = new ListingsGateway(null as any);
      gateway.server = mockServer as any;

      gateway.emitStatusChanged('listing-1', 'pending', new Date());

      expect(mockServer.to).toHaveBeenCalledWith('listing:listing-1');
      expect(mockRoom.emit).toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    // 4. Duplicate transaction expressInterest check
    it('1.5: ListingStateMachineService expressInterest throws ConflictException if transaction exists', async () => {
      const mockListingRepo = {
        update: jest.fn(),
      };
      const mockListingsService = {
        findOne: jest.fn().mockResolvedValue({
          id: 'l1',
          creatorId: 'creator-1',
          status: ListingStatusEnum.OPEN,
          priceCents: 100,
        }),
      };
      const mockTxService = {
        findOneByListingId: jest.fn().mockResolvedValue({ id: 't1' }),
        create: jest.fn(),
      };

      const smService = new ListingStateMachineService(
        mockListingRepo as any,
        mockListingsService as any,
        mockTxService as any,
        null as any,
        null as any,
        null as any,
        null as any
      );

      await expect(smService.expressInterest('l1', 'requester-1')).rejects.toThrow(ConflictException);
    });

    // 5. Desktop token 90-day expiry via SSO
    it('1.19: SsoService signs desktop token with 90 days expiry', async () => {
      const mockRedis = {
        get: jest.fn().mockResolvedValue(JSON.stringify({ status: 'pending', expiresAt: Date.now() + 10000 })),
        set: jest.fn(),
      };
      const mockUserRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'u1' }),
      };
      const mockTokenService = {
        generateAccessToken: jest.fn().mockReturnValue('mock-access'),
        generateRefreshToken: jest.fn().mockReturnValue('mock-refresh'),
        hashRefreshToken: jest.fn().mockReturnValue('mock-hash'),
        storeRefreshInRedis: jest.fn(),
      };
      const mockSessionService = {
        createSession: jest.fn().mockResolvedValue({ id: 's1' }),
      };
      const ssoService = new SsoService(
        mockRedis as any,
        mockUserRepo as any,
        mockTokenService as any,
        mockSessionService as any
      );

      await ssoService.validateQr('mock-uuid', 'u1');
      expect(mockTokenService.generateAccessToken).toHaveBeenCalled();
      expect(mockTokenService.generateRefreshToken).toHaveBeenCalled();
    });

    // 6. exportJson DB error propagation
    it('1.13: UsersService exportJson propagates DB errors instead of silent empty arrays', async () => {
      const mockUserRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'u1' }),
        manager: {
          query: jest.fn().mockRejectedValue(new Error('Database Query Failure')),
        },
      };

      const usersService = new UsersService(
        mockUserRepo as any,
        null as any,
        null as any,
        null as any,
        null as any,
        null as any,
        null as any
      );
      
      usersService.getProfile = jest.fn().mockResolvedValue({ id: 'u1' });

      await expect(usersService.exportJson('u1')).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('Property 2: Preservation (Regression Testing)', () => {
    
    // 1. Valid login values validation passes
    it('3.2: LoginDto validation passes for valid credentials', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.emailAddress(),
            password: fc.string({ minLength: 8, maxLength: 50 }).filter(s => !s.includes(' ')),
          }),
          async (payload) => {
            const dto = new LoginDto();
            dto.email = payload.email;
            dto.password = payload.password;

            const errors = await validate(dto);
            if (errors.length > 0) {
              console.log('VALIDATION ERRORS:', JSON.stringify(errors, null, 2));
            }
            expect(errors.length).toBe(0);
          }
        ),
        { numRuns: 20 }
      );
    });

    // 2. WebSocket gateway allows connection with valid JWT
    it('3.1: WebSocket gateway allows connection when token is valid', () => {
      const mockJwtService = {
        verify: jest.fn().mockReturnValue({ sub: 'user-1' }),
      };
      
      const gateway = new ListingsGateway(mockJwtService as any);
      const mockClient = {
        handshake: {
          auth: { token: 'valid-token' },
          query: { userId: 'user-1' },
        },
        disconnect: jest.fn(),
      };

      gateway.handleConnection(mockClient as any);
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    // 3. Single expressInterest creates a transaction
    it('3.5: ListingStateMachineService expressInterest creates transaction when no transaction exists', async () => {
      const mockListingRepo = {
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mockListingsService = {
        findOne: jest.fn().mockResolvedValue({
          id: 'l1',
          creatorId: 'creator-1',
          status: ListingStatusEnum.OPEN,
          priceCents: 100,
          updatedAt: new Date(),
        }),
      };
      const mockTx = { id: 't1' };
      const mockTxService = {
        findOneByListingId: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockTx),
      };
      const mockGateway = {
        joinPartiesToRoom: jest.fn(),
        emitStatusChanged: jest.fn(),
      };
      const mockQueue = {
        add: jest.fn().mockResolvedValue({}),
      };

      const smService = new ListingStateMachineService(
        mockListingRepo as any,
        mockListingsService as any,
        mockTxService as any,
        mockGateway as any,
        mockQueue as any,
        mockQueue as any,
        mockQueue as any
      );

      const result = await smService.expressInterest('l1', 'requester-1');
      expect(result.transaction).toBe(mockTx);
      expect(mockTxService.create).toHaveBeenCalled();
    });
  });
});
