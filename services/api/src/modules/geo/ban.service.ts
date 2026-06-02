import { Injectable, Logger } from '@nestjs/common';
import { parseFeatureCollection } from './geojson-parser';
import {
  HttpRetryService,
  HttpRequestFailedException,
  HttpRequestTimeoutException,
} from '../../common/http-retry/http-retry.service';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  confidence: number;
}

export class BanUnavailableException extends Error {}
export class BanTimeoutException extends Error {}
export class BanServerException extends Error {}
export class BanParseException extends Error {}
export class AddressValidationException extends Error {}
export class NoResultsError extends Error {}

@Injectable()
export class BanService {
  private readonly logger = new Logger(BanService.name);
  private readonly baseUrl = 'http://ban:7878/search/';

  constructor(private readonly httpRetryService: HttpRetryService) {}

  async geocode(address: string, limit?: number): Promise<GeocodingResult> {
    this.validateAddress(address);
    const trimmedAddress = address.trim();
    const encodedAddress = encodeURIComponent(trimmedAddress);

    let url = `${this.baseUrl}?q=${encodedAddress}`;
    if (limit && Number.isInteger(limit) && limit >= 1 && limit <= 20) {
      url += `&limit=${limit}`;
    }

    try {
      const response = await this.httpRetryService.fetchWithRetry(
        url,
        {},
        {
          maxAttempts: 4,
          backoffs: [1000, 2000, 4000],
          timeoutMs: 5000,
        },
      );

      const data = await response.json();
      const parsed = parseFeatureCollection(data);
      if (parsed.length === 0) {
        throw new NoResultsError(
          `No results found for address: ${trimmedAddress}`,
        );
      }

      const best = parsed[0];
      return {
        latitude: best.latitude,
        longitude: best.longitude,
        confidence: best.score,
      };
    } catch (error) {
      if (
        error instanceof NoResultsError ||
        error instanceof BanParseException
      ) {
        throw error;
      }
      if (error instanceof HttpRequestTimeoutException) {
        throw new BanTimeoutException(`BAN API timed out after 4 attempts`);
      }
      if (error instanceof HttpRequestFailedException) {
        throw new BanServerException(`BAN API returned ${error.status}`);
      }
      throw new BanUnavailableException(
        `BAN API unavailable: ${error.message}`,
      );
    }
  }

  validateAddress(address: string): boolean {
    if (!address || typeof address !== 'string') {
      throw new AddressValidationException('Address must be a string');
    }
    const trimmed = address.trim();
    if (trimmed.length === 0 || address.length > 200) {
      throw new AddressValidationException(
        'Address must be between 1 and 200 characters',
      );
    }
    return true;
  }
}
