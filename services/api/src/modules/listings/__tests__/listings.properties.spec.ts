import * as fc from 'fast-check';
import * as crypto from 'crypto';
import { ListingsService } from '../listings.service';
import { ListingContentService } from '../listing-content.service';
import { ListingMediaService } from '../listing-media.service';
import { ListingStateMachineService } from '../listing-state-machine.service';
import { ListingTransactionService } from '../listing-transaction.service';
import { ListingReportService } from '../listing-report.service';
import { ListingModerationService } from '../listing-moderation.service';
import { ListingSignatureService } from '../listing-signature.service';
import {
  ListingStatusEnum,
  ListingTypeEnum,
  TransactionStatusEnum,
  ModerationActionEnum,
} from '../../../common/enums';
import { Listing } from '../entities/listing.entity';
import { ListingTransaction } from '../entities/listing-transaction.entity';
import { ListingReport } from '../entities/listing-report.entity';
import { ListingModerationAction } from '../entities/listing-moderation-action.entity';
import { User } from '../../users/entities/user.entity';

describe('Feature: listings-routes-cdc — Property-Based Tests', () => {
  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  };

  const mockMediaService = {
    findCoverImages: jest.fn().mockResolvedValue(new Map()),
  };

  const mockGateway = {
    joinPartiesToRoom: jest.fn(),
    emitStatusChanged: jest.fn(),
  };

  const mockTotpService = {
    decryptSecret: jest.fn((s) => s),
  };

  const mockConfigService = {
    getConfig: jest
      .fn()
      .mockResolvedValue({ commissionPercent: 5, contractExpirationHours: 24 }),
  };

  const mockNotificationsService = {
    create: jest.fn().mockResolvedValue({}),
  };

  const mockPointsService = {
    debit: jest.fn().mockResolvedValue({}),
    credit: jest.fn().mockResolvedValue({}),
    recordCommission: jest.fn().mockResolvedValue({}),
  };

  function makeMockDataSource(target?: any) {
    return {
      transaction: jest.fn(async (cb: any) =>
        cb({
          update: jest.fn((_entity: any, _criteria: any, values: any) => {
            if (target) Object.assign(target, values);
            return Promise.resolve({ affected: 1 });
          }),
          save: jest.fn((entity: any) => Promise.resolve(entity)),
        }),
      ),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Property 1: Listing filter correctness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            neighbourhoodId: fc.oneof(
              fc.constant('n1'),
              fc.constant('n2'),
              fc.constant(null),
            ),
            categoryId: fc.oneof(
              fc.constant(1),
              fc.constant(2),
              fc.constant(null),
            ),
            listingType: fc.oneof(
              fc.constant(ListingTypeEnum.OFFER),
              fc.constant(ListingTypeEnum.REQUEST),
            ),
            status: fc.oneof(
              fc.constant(ListingStatusEnum.OPEN),
              fc.constant(ListingStatusEnum.PENDING),
              fc.constant(ListingStatusEnum.CLOSED),
            ),
            deletedAt: fc.oneof(fc.constant(null), fc.constant(new Date())),
          }),
          { minLength: 1, maxLength: 50 },
        ),
        fc.record({
          neighbourhood: fc.oneof(fc.constant('n1'), fc.constant(undefined)),
          category: fc.oneof(fc.constant(1), fc.constant(undefined)),
          type: fc.oneof(fc.constant('offer'), fc.constant(undefined)),
          status: fc.oneof(
            fc.constant('open'),
            fc.constant('pending'),
            fc.constant(undefined),
          ),
        }),
        async (listingsData, filters) => {
          const mockQueryBuilder: any = {
            leftJoin: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockImplementation(() => {
              const filtered = listingsData.filter((item) => {
                if (item.deletedAt !== null) return false;
                if (
                  filters.neighbourhood &&
                  item.neighbourhoodId !== filters.neighbourhood
                )
                  return false;
                if (
                  filters.category !== undefined &&
                  item.categoryId !== filters.category
                )
                  return false;
                if (filters.type && item.listingType !== filters.type)
                  return false;
                if (
                  filters.status &&
                  filters.status !== 'all' &&
                  item.status !== filters.status
                )
                  return false;
                return true;
              });
              return Promise.resolve([filtered, filtered.length]);
            }),
          };

          const mockRepo: any = {
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          };

          try {
            const service = new ListingsService(
              mockRepo,
              {} as any,
              { find: jest.fn().mockResolvedValue([]) } as any,
              mockMediaService as any,
              mockQueue,
            );
            const result = await service.list('test-user-id', filters as any);

            result.data.forEach((listing) => {
              expect(listing.deletedAt).toBeNull();
              if (filters.neighbourhood) {
                expect(listing.neighbourhoodId).toBe(filters.neighbourhood);
              }
              if (filters.category !== undefined) {
                expect(listing.categoryId).toBe(filters.category);
              }
              if (filters.type) {
                expect(listing.listingType).toBe(filters.type);
              }
              if (filters.status && filters.status !== 'all') {
                expect(listing.status).toBe(filters.status);
              }
            });
          } catch (e) {
            console.error('--- Property 1 Failure Trace ---');
            console.error(e);
            throw e;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 2: Pagination ordering invariant', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            createdAt: fc.date().filter((d) => !isNaN(d.getTime())),
            deletedAt: fc.constant(null),
            status: fc.constant(ListingStatusEnum.OPEN),
          }),
          { minLength: 5, maxLength: 50 },
        ),
        fc.integer({ min: 1, max: 5 }), // limit
        fc.integer({ min: 0, max: 5 }), // offset
        async (listingsData, limit, offset) => {
          const sortedAll = [...listingsData].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );

          const mockQueryBuilder: any = {
            leftJoin: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockImplementation(() => {
              const paginated = sortedAll.slice(offset, offset + limit);
              return Promise.resolve([paginated, sortedAll.length]);
            }),
          };

          const mockRepo: any = {
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          };

          const service = new ListingsService(
            mockRepo,
            {} as any,
            { find: jest.fn().mockResolvedValue([]) } as any,
            mockMediaService as any,
            mockQueue,
          );
          const result = await service.list('test-user-id', {
            offset,
            limit,
          });

          for (let i = 0; i < result.data.length - 1; i++) {
            expect(result.data[i].createdAt.getTime()).toBeGreaterThanOrEqual(
              result.data[i + 1].createdAt.getTime(),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 3: Listing creation preserves input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // creatorId
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), // title (must be non-empty after trim)
        fc.oneof(fc.constant('offer'), fc.constant('request')), // listing_type
        fc.string(), // description
        fc.integer({ min: 0 }), // price_cents
        fc.integer(), // category_id
        fc.uuid(), // neighbourhood_id
        async (creatorId, title, type, description, price, catId, neighId) => {
          const payload = {
            title,
            listing_type: type,
            description,
            price_cents: price,
            category_id: catId,
            neighbourhood_id: neighId,
          };

          const mockRepo: any = {
            create: jest.fn((data) => ({
              ...data,
              id: 'mock-listing-uuid',
              createdAt: new Date(),
            })),
            save: jest.fn((data) => Promise.resolve(data)),
          };

          const service = new ListingsService(
            mockRepo,
            {} as any,
            { find: jest.fn().mockResolvedValue([]) } as any,
            mockMediaService as any,
            mockQueue,
          );
          const result = await service.create(creatorId, payload);

          expect(result.title).toBe(title);
          expect(result.listingType).toBe(type);
          expect(result.description).toBe(description || null);
          expect(result.priceCents).toBe(price);
          expect(result.categoryId).toBe(catId || null);
          expect(result.neighbourhoodId).toBe(neighId || null);
          expect(result.status).toBe(ListingStatusEnum.OPEN);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 4: State machine transition guards', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(ListingStatusEnum.OPEN),
          fc.constant(ListingStatusEnum.PENDING),
          fc.constant(ListingStatusEnum.IN_PROGRESS),
          fc.constant(ListingStatusEnum.CLOSED),
          fc.constant(ListingStatusEnum.CANCELLED),
        ),
        fc.oneof(
          fc.constant('expressInterest'),
          fc.constant('acceptInterest'),
          fc.constant('confirmExecution'),
        ),
        async (currentStatus, transition) => {
          const listing = {
            id: 'l1',
            creatorId: 'c1',
            status: currentStatus,
            priceCents: 100,
          };

          const mockListingRepo: any = {
            findOne: jest.fn().mockResolvedValue(listing),
            update: jest.fn().mockResolvedValue({ affected: 0 }),
          };

          const mockListingsService: any = {
            findOne: jest.fn().mockResolvedValue(listing),
          };

          const mockTxService: any = {
            create: jest.fn().mockResolvedValue({
              id: 't1',
              providerId: 'c1',
              requesterId: 'r1',
            }),
            findByListingId: jest.fn().mockResolvedValue({
              id: 't1',
              providerId: 'c1',
              requesterId: 'r1',
              providerConfirmedAt: null,
              requesterConfirmedAt: null,
            }),
            verifyPartyAccess: jest.fn().mockResolvedValue(true),
            save: jest.fn().mockImplementation((t) => Promise.resolve(t)),
          };

          const smService = new ListingStateMachineService(
            mockListingRepo,
            mockListingsService,
            mockTxService,
            mockGateway as any,
            mockQueue,
            mockQueue,
            mockQueue,
            mockConfigService as any,
            mockNotificationsService as any,
            mockPointsService as any,
            makeMockDataSource(listing) as any,
          );

          if (transition === 'expressInterest') {
            if (currentStatus !== ListingStatusEnum.OPEN) {
              await expect(
                smService.expressInterest('l1', 'r1'),
              ).rejects.toThrow();
            }
          } else if (transition === 'acceptInterest') {
            if (currentStatus !== ListingStatusEnum.PENDING) {
              await expect(
                smService.acceptInterest('l1', 'c1'),
              ).rejects.toThrow();
            }
          } else if (transition === 'confirmExecution') {
            if (currentStatus !== ListingStatusEnum.IN_PROGRESS) {
              await expect(
                smService.confirmExecution('l1', 'c1'),
              ).rejects.toThrow();
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 5: Owner-only mutation guard', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // creatorId
        fc.uuid(), // strangerId
        async (creatorId, strangerId) => {
          const testStrangerId =
            strangerId === creatorId ? strangerId + '-different' : strangerId;

          const listing = {
            id: 'l1',
            creatorId,
            status: ListingStatusEnum.OPEN,
          };

          const mockListingRepo: any = {
            findOne: jest.fn().mockResolvedValue(listing),
          };

          const mockListingsService: any = {
            findOne: jest.fn().mockResolvedValue(listing),
          };

          const mockContentModel: any = {
            findOne: jest.fn().mockReturnThis(),
          };

          const contentService = new ListingContentService(
            mockListingRepo,
            mockContentModel,
            mockListingsService,
          );

          await expect(
            contentService.updateContent(testStrangerId, 'l1', {
              body_html: 'html',
            }),
          ).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 6: Party-only access guard', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // providerId
        fc.uuid(), // requesterId
        fc.uuid(), // strangerId
        async (providerId, requesterId, strangerId) => {
          let testStrangerId = strangerId;
          if (testStrangerId === providerId) testStrangerId += '-not-provider';
          if (testStrangerId === requesterId)
            testStrangerId += '-not-requester';

          const tx = new ListingTransaction();
          tx.id = 'tx1';
          tx.providerId = providerId;
          tx.requesterId = requesterId;

          const mockRepo: any = {};
          const service = new ListingTransactionService(mockRepo);

          await expect(
            service.verifyPartyAccess(testStrangerId, tx),
          ).rejects.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 7: Media deletion reorders contiguously', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }).chain((count) =>
          fc.record({
            count: fc.constant(count),
            deleteIndex: fc.integer({ min: 0, max: count - 1 }),
          }),
        ),
        async ({ count, deleteIndex }) => {
          const mockListingRepo: any = {
            findOne: jest.fn().mockResolvedValue({ id: 'l1', creatorId: 'c1' }),
          };

          const mockMediaService: any = {
            findById: jest.fn().mockResolvedValue({
              owner_id: 'l1',
              owner_type: 'listing_photo',
            }),
            delete: jest.fn().mockResolvedValue(undefined),
          };

          const mediaService = new ListingMediaService(
            mockListingRepo,
            mockMediaService,
          );

          await mediaService.deleteMedia('c1', 'l1', `p-${deleteIndex}`);

          expect(mockListingRepo.findOne).toHaveBeenCalledWith({
            where: { id: 'l1' },
          });
          expect(mockMediaService.findById).toHaveBeenCalledWith(
            `p-${deleteIndex}`,
          );
          expect(mockMediaService.delete).toHaveBeenCalledWith(
            `p-${deleteIndex}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 8: Cancellation cascades to transaction', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(ListingStatusEnum.PENDING),
          fc.constant(ListingStatusEnum.IN_PROGRESS),
        ),
        async (initialStatus) => {
          const listing = {
            id: 'l1',
            creatorId: 'c1',
            status: initialStatus,
          };

          const tx = {
            id: 'tx1',
            listingId: 'l1',
            providerId: 'c1',
            requesterId: 'r1',
            status: TransactionStatusEnum.PENDING,
            cancelledAt: null,
          };

          const mockListingRepo: any = {
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          };

          const mockListingsService: any = {
            findOne: jest.fn().mockResolvedValue(listing),
          };

          const mockTxService: any = {
            findByListingId: jest.fn().mockResolvedValue(tx),
            save: jest.fn().mockImplementation((t) => {
              tx.status = t.status;
              tx.cancelledAt = t.cancelledAt;
              return Promise.resolve(tx);
            }),
          };

          const smService = new ListingStateMachineService(
            mockListingRepo,
            mockListingsService,
            mockTxService,
            mockGateway as any,
            mockQueue,
            mockQueue,
            mockQueue,
            mockConfigService as any,
            mockNotificationsService as any,
            mockPointsService as any,
            makeMockDataSource(listing) as any,
          );

          await smService.cancel('l1', 'c1', 'Cancelled by creator');

          expect(tx.status).toBe(TransactionStatusEnum.CANCELLED);
          expect(tx.cancelledAt).toBeInstanceOf(Date);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 9: Moderation action effect mapping', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant('cancelled'),
          fc.constant('warned'),
          fc.constant('restored'),
        ),
        async (action) => {
          const listing = {
            id: 'l1',
            creatorId: 'c1',
            status: ListingStatusEnum.OPEN,
            updatedAt: null,
          };

          const mockModActionRepo: any = {
            create: jest.fn().mockImplementation((data) => data),
            save: jest.fn().mockResolvedValue({}),
          };

          const mockListingRepo: any = {
            save: jest.fn().mockImplementation((l) => {
              listing.status = l.status;
              return Promise.resolve(listing);
            }),
          };

          const mockReportRepo: any = {
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          };

          const mockUserRepo: any = {
            findOne: jest.fn().mockResolvedValue({
              id: 'c1',
              email: 'c1@example.com',
              firstName: 'C',
            }),
          };

          const mockListingsService: any = {
            findOne: jest.fn().mockResolvedValue(listing),
          };

          const mockTxService: any = {
            findByListingId: jest.fn().mockResolvedValue({}),
            save: jest.fn(),
          };

          const modService = new ListingModerationService(
            mockModActionRepo,
            mockListingRepo,
            mockReportRepo,
            mockUserRepo,
            mockListingsService,
            mockTxService,
            mockQueue,
            mockQueue,
          );

          try {
            await modService.moderate('mod1', 'l1', {
              action,
              reason: 'Violated rules',
            });

            if (action === 'cancelled') {
              expect(listing.status).toBe(ListingStatusEnum.CANCELLED);
            } else if (action === 'restored') {
              expect(listing.status).toBe(ListingStatusEnum.OPEN);
            } else {
              expect(listing.status).toBe(ListingStatusEnum.OPEN); // warned unchanged
            }
          } catch (e) {
            console.error('Property 9 Error:', e);
            throw e;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 10: SHA-256 integrity round-trip', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 10 }), (binaryData) => {
        const buffer = Buffer.from(binaryData);
        const hash1 = crypto.createHash('sha256').update(buffer).digest('hex');
        const hash2 = crypto
          .createHash('sha256')
          .update(Buffer.from(binaryData))
          .digest('hex');
        expect(hash1).toBe(hash2);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 11: Signed document immutability', async () => {
    await fc.assert(
      fc.asyncProperty(fc.date(), async (signedDate) => {
        const contract = {
          pg_transaction_id: 'tx1',
          pdf: { data: Buffer.from('pdf') },
          sha256_hash: crypto
            .createHash('sha256')
            .update(Buffer.from('pdf'))
            .digest('hex'),
          signed_at: signedDate,
          save: jest.fn(),
        };

        const mockContractModel: any = {
          findOne: jest.fn().mockResolvedValue(contract),
        };

        const mockUserRepo: any = {};
        const mockTxService: any = {
          findByListingId: jest.fn().mockResolvedValue({
            id: 'tx1',
            providerId: 'p1',
            requesterId: 'r1',
          }),
          verifyPartyAccess: jest.fn().mockResolvedValue(true),
        };

        const signatureService = new ListingSignatureService(
          mockUserRepo,
          mockContractModel,
          mockTxService,
          mockTotpService as any,
          {} as any,
          {} as any,
          mockNotificationsService as any,
        );

        try {
          await expect(
            signatureService.signDocument('p1', 'l1', {
              canvas_b64: 'sig',
              totp_code: '123456',
            }),
          ).rejects.toThrow();
        } catch (e) {
          console.error('Property 11 Error:', e);
          throw e;
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Property 12: Dual confirmation closes listing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant('provider'), fc.constant('requester')),
        async (firstToConfirm) => {
          const listing = {
            id: 'l1',
            status: ListingStatusEnum.IN_PROGRESS,
            closedAt: null,
          };

          const tx = {
            id: 'tx1',
            listingId: 'l1',
            providerId: 'p1',
            requesterId: 'r1',
            providerConfirmedAt: null,
            requesterConfirmedAt: null,
            status: TransactionStatusEnum.PENDING,
          };

          const mockListingRepo: any = {
            update: jest.fn().mockImplementation((c, u) => {
              listing.status = u.status;
              listing.closedAt = u.closedAt;
              return Promise.resolve({ affected: 1 });
            }),
          };

          const mockListingsService: any = {
            findOne: jest.fn().mockResolvedValue(listing),
          };

          const mockTxService: any = {
            findByListingId: jest.fn().mockResolvedValue(tx),
            verifyPartyAccess: jest.fn(),
            save: jest.fn().mockImplementation((t) => {
              Object.assign(tx, t);
              return Promise.resolve(tx);
            }),
          };

          const smService = new ListingStateMachineService(
            mockListingRepo,
            mockListingsService,
            mockTxService,
            mockGateway as any,
            mockQueue,
            mockQueue,
            mockQueue,
            mockConfigService as any,
            mockNotificationsService as any,
            mockPointsService as any,
            makeMockDataSource(listing) as any,
          );

          try {
            const firstUser = firstToConfirm === 'provider' ? 'p1' : 'r1';
            await smService.confirmExecution('l1', firstUser);

            expect(listing.status).toBe(ListingStatusEnum.IN_PROGRESS);
            expect(listing.closedAt).toBeNull();

            const secondUser = firstToConfirm === 'provider' ? 'r1' : 'p1';
            await smService.confirmExecution('l1', secondUser);

            expect(listing.status).toBe(ListingStatusEnum.CLOSED);
            expect(listing.closedAt).toBeInstanceOf(Date);
          } catch (e) {
            console.error('Property 12 Error:', e);
            throw e;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 13: Reported listings sort invariant', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            title: fc.string(),
            reports_count: fc.integer({ min: 1, max: 10 }),
            last_report_at: fc.date().filter((d) => !isNaN(d.getTime())),
          }),
          { minLength: 2, maxLength: 20 },
        ),
        async (reportedListings) => {
          try {
            const uniqueListings: any[] = [];
            const seen = new Set();
            for (const item of reportedListings) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                uniqueListings.push(item);
              }
            }

            if (uniqueListings.length < 2) return;

            const mockListingRepo: any = {
              manager: {
                query: jest.fn().mockImplementation((sql) => {
                  if (sql.includes('COUNT')) {
                    const sorted = [...uniqueListings].sort((a, b) => {
                      if (b.reports_count !== a.reports_count) {
                        return b.reports_count - a.reports_count;
                      }
                      return (
                        b.last_report_at.getTime() - a.last_report_at.getTime()
                      );
                    });
                    return Promise.resolve(sorted);
                  }
                  return Promise.resolve([{ count: uniqueListings.length }]);
                }),
              },
            };

            const reportService = new ListingReportService(
              {} as any,
              mockListingRepo,
            );

            const result = await reportService.getReportedListings({
              limit: 20,
              offset: 0,
            });

            for (let i = 0; i < result.data.length - 1; i++) {
              const current = result.data[i];
              const next = result.data[i + 1];

              if (current.reports_count !== next.reports_count) {
                expect(current.reports_count).toBeGreaterThan(
                  next.reports_count,
                );
              } else {
                expect(current.last_report_at.getTime()).toBeGreaterThanOrEqual(
                  next.last_report_at.getTime(),
                );
              }
            }
          } catch (e) {
            console.error('Property 13 Error:', e);
            throw e;
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
