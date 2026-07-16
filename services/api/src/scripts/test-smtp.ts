/**
 * Standalone SMTP config check — sends a plain test email via the same
 * transport settings mail.service.ts uses, without booting the full app.
 *
 * Usage:
 *   npm run mail:test -- someone@example.com
 *
 * Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_SECURE /
 * SMTP_FROM from the environment (loaded from the repo-root .env when run
 * outside Docker; already present in process.env when run via
 * `docker compose exec api npm run mail:test -- someone@example.com`).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import * as nodemailer from 'nodemailer';

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: npm run mail:test -- someone@example.com');
    process.exit(1);
  }

  const host = process.env.SMTP_HOST ?? 'localhost';
  const port = Number(process.env.SMTP_PORT ?? 1025);
  const user = process.env.SMTP_USER || undefined;
  const password = process.env.SMTP_PASSWORD || undefined;
  const secure = process.env.SMTP_SECURE === 'true';
  const from = process.env.SMTP_FROM ?? 'noreply@nabor.fr';

  console.log(
    `Connecting to ${host}:${port} (secure=${secure}, auth=${user ? 'yes' : 'no'})...`,
  );

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass: password } : undefined,
  });

  await transporter.verify();
  console.log('SMTP connection + auth verified.');

  const info = await transporter.sendMail({
    from,
    to,
    subject: 'NaborService — test SMTP',
    html: '<p>Ceci est un email de test confirmant que la configuration SMTP fonctionne.</p>',
  });

  console.log(`Message sent to ${to}: ${info.messageId}`);
}

main().catch((err) => {
  console.error('SMTP test failed:', err);
  process.exit(1);
});
