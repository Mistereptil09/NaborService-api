import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const DB_RETRY_CONFIG = {
  maxAttempts: 5,
  delayMs: 3000,
} as const;

export function requireEnv(
  config: ConfigService,
  varName: string,
  serviceName: string,
): string {
  const value = config.get<string>(varName);
  if (!value) {
    const logger = new Logger(serviceName);
    logger.error(
      `${varName} is not defined. Set it in .env or environment variables.`,
    );
    throw new Error(
      `[${serviceName}] Missing required environment variable: ${varName}`,
    );
  }
  return value;
}

export async function connectWithRetry<T>(
  serviceName: string,
  connectFn: () => Promise<T>,
  options: { maxAttempts?: number; delayMs?: number } = {},
): Promise<T> {
  const logger = new Logger(serviceName);
  const maxAttempts = options.maxAttempts ?? DB_RETRY_CONFIG.maxAttempts;
  const delayMs = options.delayMs ?? DB_RETRY_CONFIG.delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.log(`Connection attempt ${attempt}/${maxAttempts}...`);
      const result = await connectFn();
      logger.log('Connected successfully.');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === maxAttempts) {
        logger.error(
          `Connection failed after ${maxAttempts} attempts: ${message}`,
        );
        throw new Error(
          `[${serviceName}] Unable to connect after ${maxAttempts} attempts: ${message}`,
        );
      }
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed: ${message}. Retrying in ${delayMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`[${serviceName}] Connection failed`);
}
