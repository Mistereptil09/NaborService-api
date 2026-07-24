import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpRetryService } from '../../common/http-retry/http-retry.service';

export interface UpdateManifest {
  version: string;
  sha256: string;
  changelog_url?: string;
  download_url?: string;
}

@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);
  private readonly manifestUrl: string;
  private readonly cacheTtlMs: number;

  private cachedManifest: UpdateManifest | null = null;
  private cacheExpiresAt = 0;
  private inflight: Promise<UpdateManifest> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly httpRetry: HttpRetryService,
  ) {
    const repo =
      this.config.get<string>('UPDATES_GITHUB_REPO') ??
      'Mistereptil09/Nabor-Java-Client';
    this.manifestUrl = `https://github.com/${repo}/releases/latest/download/latest.json`;

    const ttl = Number(this.config.get<string>('UPDATES_CACHE_TTL_MS'));
    this.cacheTtlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : 300_000;
  }

  async getLatest(): Promise<UpdateManifest> {
    if (this.cachedManifest && Date.now() < this.cacheExpiresAt) {
      return this.cachedManifest;
    }

    this.inflight ??= this.fetchManifest().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async getDownloadUrl(): Promise<string> {
    const manifest = await this.getLatest();
    if (!manifest.download_url) {
      throw new NotFoundException('No download URL in update manifest');
    }
    return manifest.download_url;
  }

  private async fetchManifest(): Promise<UpdateManifest> {
    try {
      const response = await this.httpRetry.fetchWithRetry(this.manifestUrl, {
        headers: { Accept: 'application/json' },
      });
      const manifest = (await response.json()) as UpdateManifest;

      if (!manifest.version || !manifest.sha256) {
        throw new Error('Invalid update manifest received from GitHub');
      }

      this.cachedManifest = manifest;
      this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
      return manifest;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.cachedManifest) {
        this.logger.warn(
          `Failed to refresh update manifest, serving stale cache: ${message}`,
        );
        return this.cachedManifest;
      }
      this.logger.error(
        `Failed to fetch update manifest from ${this.manifestUrl}: ${message}`,
      );
      throw new ServiceUnavailableException('Update manifest unavailable');
    }
  }
}
