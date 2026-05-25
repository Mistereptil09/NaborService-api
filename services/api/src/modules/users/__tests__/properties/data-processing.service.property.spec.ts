import * as fc from 'fast-check';
import { Repository } from 'typeorm';
import { DataProcessingService } from '../../data-processing.service';
import { UserDataProcessing } from '../../entities/user-data-processing.entity';
import { PROCESSING_TYPES } from '../../data-processing.constants';

describe('Feature: rgpd-data-processing-table, Property Tests for DataProcessingService', () => {
  let mockRepo: jest.Mocked<Repository<UserDataProcessing>>;
  let service: DataProcessingService;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserDataProcessing>>;

    service = new DataProcessingService(mockRepo);
  });

  it('Property 1: isOptedOut correctness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // userId
        fc.uniqueArray(fc.constantFrom(...PROCESSING_TYPES)), // optOuts
        fc.boolean(), // isRestricted
        fc.oneof(
          fc.constantFrom(...PROCESSING_TYPES),
          fc.string().filter((s) => !PROCESSING_TYPES.includes(s as any)),
        ), // processingType
        async (userId, optOuts, isRestricted, processingType) => {
          mockRepo.findOne.mockClear();
          mockRepo.findOne.mockResolvedValue({
            userId,
            optOuts,
            isRestricted,
            restrictedAt: isRestricted ? new Date() : null,
            updatedAt: null,
          } as UserDataProcessing);

          const result = await service.isOptedOut(userId, processingType);

          const isValidType = PROCESSING_TYPES.includes(processingType as any);
          if (!isValidType) {
            expect(result).toBe(false);
          } else {
            const expected = isRestricted || optOuts.includes(processingType);
            expect(result).toBe(expected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 2: getEffectiveOptOuts correctness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // userId
        fc.uniqueArray(fc.constantFrom(...PROCESSING_TYPES)), // optOuts
        fc.boolean(), // isRestricted
        async (userId, optOuts, isRestricted) => {
          mockRepo.findOne.mockClear();
          mockRepo.findOne.mockResolvedValue({
            userId,
            optOuts,
            isRestricted,
            restrictedAt: isRestricted ? new Date() : null,
            updatedAt: null,
          } as UserDataProcessing);

          const result = await service.getEffectiveOptOuts(userId);

          if (isRestricted) {
            expect(result).toEqual(expect.arrayContaining([...PROCESSING_TYPES]));
            expect(result.length).toBe(PROCESSING_TYPES.length);
          } else {
            expect(result).toEqual(optOuts);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
