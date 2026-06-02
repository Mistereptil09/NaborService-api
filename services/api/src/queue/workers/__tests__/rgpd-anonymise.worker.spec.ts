import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UnrecoverableError } from 'bullmq';
import { RgpdAnonymiseWorker } from '../rgpd-anonymise.worker';
import { UserSession } from '../../../common/entities/user-session.entity';

describe('RgpdAnonymiseWorker', () => {
  let worker: RgpdAnonymiseWorker;
  const mockManager = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const mockDataSource = {
    transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RgpdAnonymiseWorker,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    worker = module.get<RgpdAnonymiseWorker>(RgpdAnonymiseWorker);
    jest.clearAllMocks();
  });

  it('should anonymize user PII and revoke sessions', async () => {
    const user = {
      id: 'usr-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      bio: 'Hello world',
    };
    mockManager.findOne.mockResolvedValueOnce(user);

    await worker.process({ data: { userId: 'usr-1' } } as any);

    expect(mockManager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: expect.stringMatching(/^Anonymized-[a-f0-9]{16}$/),
        lastName: expect.stringMatching(/^Anonymized-[a-f0-9]{16}$/),
        email: expect.stringMatching(/^anonymized-[a-f0-9]{16}@deleted\.user$/),
        bio: null,
      }),
    );

    expect(mockManager.update).toHaveBeenCalledWith(
      UserSession,
      expect.objectContaining({ userId: 'usr-1' }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('should throw UnrecoverableError if user not found', async () => {
    mockManager.findOne.mockResolvedValueOnce(null);

    await expect(
      worker.process({ data: { userId: 'usr-2' } } as any),
    ).rejects.toThrow(UnrecoverableError);
  });
});
