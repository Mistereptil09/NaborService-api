import { ListingModerationService } from '../listing-moderation.service';
import { validateEmailPayload } from '../../../queue/validators/email-payload.validator';
import { ListingStatusEnum } from '../../../common/enums';

describe('ListingModerationService — email payload', () => {
  const listing = {
    id: 'listing-1',
    title: 'Perceuse à prêter',
    status: ListingStatusEnum.OPEN,
    listingType: 'loan',
    neighbourhoodId: 'nb-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    creatorId: 'creator-1',
  };

  const mockModRepo = { create: jest.fn((x) => x), save: jest.fn() };
  const mockListingRepo = { save: jest.fn() };
  const mockReportRepo = { update: jest.fn() };
  const mockUserRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'creator-1',
      email: 'creator@example.com',
      firstName: 'Camille',
    }),
  };
  const mockListingsService = { findOne: jest.fn().mockResolvedValue(listing) };
  const mockTxService = { findByListingId: jest.fn(), save: jest.fn() };
  const mockNeo4jQueue = { add: jest.fn() };
  const mockEmailQueue = { add: jest.fn() };

  const service = new ListingModerationService(
    mockModRepo as any,
    mockListingRepo as any,
    mockReportRepo as any,
    mockUserRepo as any,
    mockListingsService as any,
    mockTxService as any,
    mockNeo4jQueue as any,
    mockEmailQueue as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('enqueues a valid, essential EmailJobPayload to the listing creator', async () => {
    await service.moderate('moderator-1', 'listing-1', {
      action: 'warned',
      reason: 'Contenu inapproprié',
    } as any);

    expect(mockEmailQueue.add).toHaveBeenCalledTimes(1);
    const [jobName, payload] = mockEmailQueue.add.mock.calls[0];

    expect(jobName).toBe('send-email');
    expect(validateEmailPayload(payload)).toBe(true);
    expect(payload).toEqual(
      expect.objectContaining({
        recipient: 'creator@example.com',
        templateName: 'listing-moderated',
        essential: true,
        templateVariables: expect.objectContaining({
          firstName: 'Camille',
          listingTitle: 'Perceuse à prêter',
          action: 'warned',
          reason: 'Contenu inapproprié',
        }),
      }),
    );
  });
});
