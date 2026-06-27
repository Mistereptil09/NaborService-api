import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailJobPayload } from '../interfaces/job-payloads';
import { classifyAndThrow } from '../utils/error-classifier';
import { getBackoffDelay } from '../utils/backoff-strategy';
import { validateEmailPayload } from '../validators/email-payload.validator';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { UserPreferencesService } from '../../modules/users/user-preferences.service';
import { MailService, MailLocale } from '../../mail/mail.service';

@Processor('email', {
  concurrency: 10,
  settings: {
    backoffStrategy: (attemptsMade: number, type: string) => {
      return type === 'custom' ? getBackoffDelay('email', attemptsMade) : 1000;
    },
  },
})
export class EmailWorker extends WorkerHost {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userPreferencesService: UserPreferencesService,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    try {
      if (!validateEmailPayload(job.data)) {
        throw new UnrecoverableError(`Invalid email payload for job ${job.id}`);
      }

      const payload: EmailJobPayload = job.data;

      // 1. Resolve User by email (may be null for external recipients).
      const user = await this.dataSource
        .getRepository(User)
        .findOne({ where: { email: payload.recipient } });

      // 2. Resolve locale: explicit override -> user preference -> 'fr'.
      const locale: MailLocale = this.resolveLocale(
        payload.locale ?? user?.locale,
      );

      // 3. Opt-out: only for non-essential emails that declare a preference key
      //    and target a known user. Essential emails always go through.
      if (!payload.essential && payload.preferenceKey && user) {
        const enabled = await this.userPreferencesService.isPreferenceEnabled(
          user.id,
          payload.preferenceKey,
        );
        if (!enabled) {
          this.logger.log(
            `Skipping email to ${payload.recipient} (Template: ${payload.templateName}): opted out (${payload.preferenceKey})`,
          );
          return { skipped: true, reason: 'user_preference_opt_out' };
        }
      }

      // 4. Render + send for real (errors propagate so BullMQ retries).
      await this.mailService.sendTemplated({
        to: payload.recipient,
        subject: payload.subject,
        templateName: payload.templateName,
        locale,
        variables: payload.templateVariables ?? {},
      });

      return { sent: true };
    } catch (error: any) {
      classifyAndThrow(error);
    }
  }

  private resolveLocale(locale: string | undefined | null): MailLocale {
    return locale === 'en' ? 'en' : 'fr';
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.error({
        queue: 'email',
        jobId: job.id,
        recipient: job.data?.recipient,
        templateName: job.data?.templateName,
        failureReason: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
