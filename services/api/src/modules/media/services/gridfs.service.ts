import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ServiceUnavailableException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';
import { Readable } from 'stream';
import { MongoHealthService } from '../../../database/mongo-health.service';

@Injectable()
export class GridFSService {
  private readonly logger = new Logger(GridFSService.name);
  private bucket: mongo.GridFSBucket | null = null;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Optional() private readonly healthService?: MongoHealthService,
  ) {
    if (this.isConnected()) {
      this.initBucket();
    }
  }

  private isConnected(): boolean {
    return this.connection.readyState === 1 && !!this.connection.db;
  }

  private initBucket(): void {
    if (!this.bucket && this.connection.db) {
      this.bucket = new mongo.GridFSBucket(this.connection.db, {
        bucketName: 'fs',
      });
    }
  }

  /** Throws 503 if MongoDB is unavailable, so callers get a clean HTTP error. */
  private ensureAvailable(): void {
    if (this.healthService && !this.healthService.isHealthy()) {
      throw new ServiceUnavailableException(
        'MongoDB est temporairement indisponible. Veuillez réessayer.',
      );
    }
    if (!this.isConnected()) {
      // Try lazy init on reconnect
      this.initBucket();
      if (!this.bucket) {
        throw new ServiceUnavailableException(
          'MongoDB est temporairement indisponible. Veuillez réessayer.',
        );
      }
    }
  }

  /**
   * Upload binary data to GridFS.
   * @returns The ObjectId of the stored file in fs.files
   */
  async upload(
    buffer: Buffer,
    filename: string,
    contentType: string,
  ): Promise<Types.ObjectId> {
    this.ensureAvailable();
    return new Promise((resolve, reject) => {
      const uploadStream = this.bucket!.openUploadStream(filename, {
        metadata: { contentType },
      });

      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);

      readableStream
        .pipe(uploadStream)
        .on('finish', () => {
          resolve(uploadStream.id);
        })
        .on('error', async (error) => {
          try {
            await this.delete(uploadStream.id);
          } catch (cleanupError) {
            // Ignore cleanup error, propagate original error
          }
          reject(
            new InternalServerErrorException(
              `GridFS upload failed: ${error.message}`,
            ),
          );
        });
    });
  }

  /**
   * Download file content from GridFS as a Buffer.
   */
  async download(fileId: Types.ObjectId): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
    length: number;
  }> {
    this.ensureAvailable();
    const fileInfo = await this.getFileInfo(fileId);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const downloadStream = this.bucket!.openDownloadStream(fileId);

      downloadStream
        .on('data', (chunk) => {
          chunks.push(chunk);
        })
        .on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: fileInfo.contentType,
            filename: fileInfo.filename,
            length: fileInfo.length,
          });
        })
        .on('error', (error) => {
          reject(
            new NotFoundException(
              `Failed to download file from GridFS: ${error.message}`,
            ),
          );
        });
    });
  }

  /**
   * Open a readable stream for a GridFS file (for HTTP streaming).
   * Supports optional byte range for partial content.
   */
  openDownloadStream(
    fileId: Types.ObjectId,
    options?: { start?: number; end?: number },
  ): mongo.GridFSBucketReadStream {
    try {
      return this.bucket!.openDownloadStream(fileId, options);
    } catch (error) {
      throw new NotFoundException(
        `File with ID ${fileId} not found in GridFS: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get file metadata from fs.files without downloading content.
   */
  async getFileInfo(fileId: Types.ObjectId): Promise<{
    length: number;
    contentType: string;
    filename: string;
    uploadDate: Date;
  }> {
    this.ensureAvailable();
    const files = await this.bucket!.find({ _id: fileId }).toArray();
    if (!files || files.length === 0) {
      throw new NotFoundException(`File with ID ${fileId} not found in GridFS`);
    }
    const file = files[0];
    return {
      length: file.length,
      contentType: file.metadata?.contentType || 'application/octet-stream',
      filename: file.filename,
      uploadDate: file.uploadDate,
    };
  }

  /**
   * Delete a file and all its chunks from GridFS.
   */
  async delete(fileId: Types.ObjectId): Promise<void> {
    this.ensureAvailable();
    try {
      await this.bucket!.delete(fileId);
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to delete GridFS file: ${(error as Error).message}`,
      );
    }
  }
}
