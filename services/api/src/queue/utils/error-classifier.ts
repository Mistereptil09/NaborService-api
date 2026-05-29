import { UnrecoverableError } from 'bullmq';

const TRANSIENT_ERROR_PATTERNS = [
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /socket hang up/,
  /5\d{2}/,
  /lock.*timeout/i,
  /Redis.*unavailable/i,
];

export function classifyAndThrow(error: Error): never {
  const isTransient = TRANSIENT_ERROR_PATTERNS.some((p) => p.test(error.message));
  if (isTransient) {
    throw error;
  }
  throw new UnrecoverableError(error.message);
}
