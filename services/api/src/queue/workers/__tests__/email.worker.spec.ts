import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Job } from 'bullmq';
import { EmailWorker } from '../email.worker';
import { MailService } from '../../../mail/mail.service';
import { UserPreferencesService } from '../../../modules/users/user-preferences.service';

describe('EmailWorker', () => {
  let worker: EmailWorker;

  const mockUserRepo = { findOne: jest.fn() };
  const mockDataSource = { getRepository: jest.fn(() => mockUserRepo) };
  const mockMailService = { sendTemplated: jest.fn().mockResolvedValue(undefined) };
  const mockPrefs = { isPreferenceEnabled: jest.fn() };

  const basePayload = {
    recipient: 'alice@example.com',
    subject: 'Hello',
    templateName: 'reset-password',
    templateVariables: { firstName: 'Alice' },
  };
  const asJob = (data: any): Job => ({ id: 'job-1', data } as unknown as Job);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailWorker,
        { provide: DataSource, useValue: mockDataSource },
        { provide: MailService, useValue: mockMailService },
        { provide: UserPreferencesService, useValue: mockPrefs },
      ],
    }).compile();

    worker = module.get<EmailWorker>(EmailWorker);
    jest.clearAllMocks();
  });

  it('sends a valid email with no preferenceKey (locale from user)', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'u1', locale: 'en' });

    const result = await worker.process(asJob(basePayload));

    expect(mockPrefs.isPreferenceEnabled).not.toHaveBeenCalled();
    expect(mockMailService.sendTemplated).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        subject: 'Hello',
        templateName: 'reset-password',
        locale: 'en',
      }),
    );
    expect(result).toEqual({ sent: true });
  });

  it('skips a non-essential email when the preference is disabled', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'u1', locale: 'fr' });
    mockPrefs.isPreferenceEnabled.mockResolvedValue(false);

    const result = await worker.process(
      asJob({ ...basePayload, preferenceKey: 'notifWaitlist' }),
    );

    expect(mockPrefs.isPreferenceEnabled).toHaveBeenCalledWith('u1', 'notifWaitlist');
    expect(mockMailService.sendTemplated).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true, reason: 'user_preference_opt_out' });
  });

  it('sends an essential email even when the user opted out', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'u1', locale: 'fr' });
    mockPrefs.isPreferenceEnabled.mockResolvedValue(false);

    const result = await worker.process(
      asJob({ ...basePayload, essential: true, preferenceKey: 'notifWaitlist' }),
    );

    // essential bypasses opt-out entirely — preference must not even be checked
    expect(mockPrefs.isPreferenceEnabled).not.toHaveBeenCalled();
    expect(mockMailService.sendTemplated).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: true });
  });

  it('sends to an external recipient (no user) defaulting to fr', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);

    await worker.process(asJob({ ...basePayload, preferenceKey: 'notifNewEvent' }));

    expect(mockPrefs.isPreferenceEnabled).not.toHaveBeenCalled();
    expect(mockMailService.sendTemplated).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'fr' }),
    );
  });

  it('throws on an invalid payload', async () => {
    await expect(
      worker.process(asJob({ recipient: 'not-an-email' })),
    ).rejects.toThrow();
    expect(mockMailService.sendTemplated).not.toHaveBeenCalled();
  });
});
