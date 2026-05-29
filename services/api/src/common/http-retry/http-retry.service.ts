import { Injectable, Logger } from '@nestjs/common';

export interface HttpRetryOptions {
  maxAttempts?: number;
  backoffs?: number[];
  timeoutMs?: number;
}

export class HttpRequestTimeoutException extends Error {}
export class HttpRequestFailedException extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

@Injectable()
export class HttpRetryService {
  private readonly logger = new Logger(HttpRetryService.name);

  async fetchWithRetry(url: string, options?: RequestInit, retryOptions?: HttpRetryOptions): Promise<Response> {
    const maxAttempts = retryOptions?.maxAttempts ?? 4;
    const backoffs = retryOptions?.backoffs ?? [1000, 2000, 4000];
    const timeoutMs = retryOptions?.timeoutMs ?? 5000;
    
    let attempt = 0;

    while (attempt < maxAttempts) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        const response = await fetch(url, { ...options, signal: abortController.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new HttpRequestFailedException(`HTTP request failed with status ${response.status}`, response.status);
        }

        return response;

      } catch (error) {
        clearTimeout(timeoutId);
        
        attempt++;
        if (attempt >= maxAttempts) {
          if (error.name === 'AbortError') {
            throw new HttpRequestTimeoutException(`HTTP request to ${url} timed out after ${maxAttempts} attempts`);
          }
          throw error;
        }

        const delay = backoffs[attempt - 1] || backoffs[backoffs.length - 1] || 1000;
        this.logger.warn(`Attempt ${attempt} failed for ${url}: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('Unknown error during fetchWithRetry');
  }
}
