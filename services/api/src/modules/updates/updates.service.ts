import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface UpdateManifest {
  version: string;
  sha256: string;
  jar_filename: string;
}

@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);
  private readonly updatesDir: string;

  constructor(private readonly config: ConfigService) {
    this.updatesDir =
      this.config.get<string>('UPDATES_DIR') ?? join(process.cwd(), 'updates');
  }

  async getLatest(): Promise<UpdateManifest> {
    const manifestPath = join(this.updatesDir, 'latest.json');
    if (!existsSync(manifestPath)) {
      throw new NotFoundException('No update manifest found');
    }

    const raw = await readFile(manifestPath, 'utf-8');
    const manifest: UpdateManifest = JSON.parse(raw);

    if (!manifest.version || !manifest.sha256 || !manifest.jar_filename) {
      throw new NotFoundException('Invalid update manifest');
    }

    return manifest;
  }

  getDownloadStream(): {
    stream: NodeJS.ReadableStream;
    filename: string;
    size: number;
  } {
    const jarPath = join(this.updatesDir, 'nabor-app.jar');
    if (!existsSync(jarPath)) {
      throw new NotFoundException('JAR file not found');
    }

    const { statSync } = require('fs');
    const stats = statSync(jarPath);

    return {
      stream: createReadStream(jarPath),
      filename: 'nabor-app.jar',
      size: stats.size,
    };
  }
}
