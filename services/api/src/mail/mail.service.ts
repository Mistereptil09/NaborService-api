import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type MailLocale = 'fr' | 'en';

export interface SendTemplatedParams {
  to: string;
  subject: string;
  /** Template file name (without extension/locale), e.g. 'reset-password'. */
  templateName: string;
  locale: MailLocale;
  variables: Record<string, any>;
}

const SUPPORTED_LOCALES: MailLocale[] = ['fr', 'en'];
const DEFAULT_LOCALE: MailLocale = 'fr';
/** Used when no template file matches the requested templateName. */
const FALLBACK_TEMPLATE = 'notification';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: Transporter;
  private readonly from: string;
  private readonly templatesDir = path.join(__dirname, 'templates');
  /** Compiled body templates, keyed by `${locale}/${templateName}`. */
  private readonly cache = new Map<string, Handlebars.TemplateDelegate>();
  /** Compiled layout, keyed by locale. */
  private readonly layoutCache = new Map<string, Handlebars.TemplateDelegate>();

  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('SMTP_FROM', 'noreply@nabor.fr');
    this.frontendUrl = this.config
      .get<string>('FRONTEND_URL', 'https://naborservice.com')
      .replace(/\/+$/, '');
  }

  onModuleInit() {
    // Equality helper for conditional wording in templates: {{#if (eq action 'cancelled')}}
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

    const host = this.config.get<string>('SMTP_HOST', 'localhost');
    const port = this.config.get<number>('SMTP_PORT', 1025);
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');
    // Mailpit (dev) accepts plain SMTP on 1025; TLS only makes sense with a real relay.
    const secure = this.config.get<string>('SMTP_SECURE') === 'true';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: password } : undefined,
    });
  }

  /**
   * Renders `templateName` in the given locale and sends it via SMTP.
   * Errors are propagated so the BullMQ worker can retry.
   */
  async sendTemplated(params: SendTemplatedParams): Promise<void> {
    const { to, subject, templateName, locale, variables } = params;

    const html = this.render(templateName, locale, variables);

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
      });
    } catch (error: any) {
      // Never log email content (reset links, tokens) — only the failure cause.
      this.logger.error(
        `Failed to send "${templateName}" to ${to}: ${error?.message ?? error}`,
      );
      throw error;
    }
  }

  /** Compiles (with cache) and renders the body, wrapped in the shared layout. */
  private render(
    templateName: string,
    locale: MailLocale,
    variables: Record<string, any>,
  ): string {
    const ctx = { frontendUrl: this.frontendUrl, ...variables };
    const body = this.compileTemplate(templateName, locale)(ctx);
    const layout = this.compileLayout(locale);
    return layout({ ...ctx, body: new Handlebars.SafeString(body) });
  }

  private compileTemplate(
    templateName: string,
    locale: MailLocale,
  ): Handlebars.TemplateDelegate {
    const requested = this.resolveLocale(locale);
    const cacheKey = `${requested}/${templateName}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Locale fallback (requested -> fr), then template fallback -> generic.
    const filePath =
      this.findTemplateFile(templateName, requested) ??
      this.findTemplateFile(FALLBACK_TEMPLATE, requested);

    if (!filePath) {
      throw new Error(
        `No template found for "${templateName}" (locale ${requested}) and no fallback "${FALLBACK_TEMPLATE}.hbs"`,
      );
    }

    const compiled = Handlebars.compile(fs.readFileSync(filePath, 'utf8'));
    this.cache.set(cacheKey, compiled);
    return compiled;
  }

  private compileLayout(locale: MailLocale): Handlebars.TemplateDelegate {
    const requested = this.resolveLocale(locale);
    const cached = this.layoutCache.get(requested);
    if (cached) return cached;

    const filePath =
      this.findTemplateFile('layout', requested) ??
      this.findTemplateFile('layout', DEFAULT_LOCALE);
    if (!filePath) {
      throw new Error(`No layout.hbs found for locale ${requested}`);
    }

    const compiled = Handlebars.compile(fs.readFileSync(filePath, 'utf8'));
    this.layoutCache.set(requested, compiled);
    return compiled;
  }

  /** Returns the .hbs path in `locale`, then falls back to `fr`, else null. */
  private findTemplateFile(name: string, locale: MailLocale): string | null {
    for (const loc of [locale, DEFAULT_LOCALE]) {
      const candidate = path.join(this.templatesDir, loc, `${name}.hbs`);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  private resolveLocale(locale: string | undefined): MailLocale {
    return SUPPORTED_LOCALES.includes(locale as MailLocale)
      ? (locale as MailLocale)
      : DEFAULT_LOCALE;
  }
}
