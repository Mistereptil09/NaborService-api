import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail.service';

const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: (...args: any[]) => mockSendMail(...args),
  })),
}));

function buildConfig(overrides: Record<string, any> = {}): ConfigService {
  const values: Record<string, any> = {
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_FROM: 'noreply@nabor.fr',
    FRONTEND_URL: 'https://app.nabor.fr',
    ...overrides,
  };
  return {
    get: (key: string, def?: any) => (key in values ? values[key] : def),
  } as unknown as ConfigService;
}

describe('MailService', () => {
  let service: MailService;

  beforeEach(() => {
    mockSendMail.mockReset().mockResolvedValue({ messageId: 'id-1' });
    service = new MailService(buildConfig());
    service.onModuleInit();
  });

  it('renders the requested template and sends it via SMTP', async () => {
    await service.sendTemplated({
      to: 'alice@example.com',
      subject: 'Réinitialisation',
      templateName: 'reset-password',
      locale: 'fr',
      variables: { resetLink: 'https://app.nabor.fr/reset?token=abc', firstName: 'Alice' },
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const sent = mockSendMail.mock.calls[0][0];
    expect(sent.from).toBe('noreply@nabor.fr');
    expect(sent.to).toBe('alice@example.com');
    expect(sent.subject).toBe('Réinitialisation');
    // The compiled body must contain the injected variables, wrapped in the layout.
    expect(sent.html).toContain('https://app.nabor.fr/reset?token=abc');
    expect(sent.html).toContain('Alice');
    expect(sent.html).toContain('Nabor'); // layout header
  });

  it('renders the English template when locale is en', async () => {
    await service.sendTemplated({
      to: 'bob@example.com',
      subject: 'Reset',
      templateName: 'reset-password',
      locale: 'en',
      variables: { resetLink: 'https://x/y', firstName: 'Bob' },
    });

    expect(mockSendMail.mock.calls[0][0].html).toContain('Reset my password');
  });

  it('falls back to the generic notification template for an unknown templateName', async () => {
    await service.sendTemplated({
      to: 'carol@example.com',
      subject: 'Notif',
      templateName: 'event:registration_result',
      locale: 'fr',
      variables: { status: 'confirmed', event_id: 'evt-9' },
    });

    const html = mockSendMail.mock.calls[0][0].html;
    expect(html).toContain('nouvelle notification'); // generic FR template
    expect(html).toContain('evt-9');
  });

  it('propagates SMTP errors so the job can be retried', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(
      service.sendTemplated({
        to: 'dave@example.com',
        subject: 'X',
        templateName: 'reset-password',
        locale: 'fr',
        variables: { resetLink: 'l', firstName: 'D' },
      }),
    ).rejects.toThrow('SMTP down');
  });
});
