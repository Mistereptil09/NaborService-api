import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';
import { Readable } from 'stream';

@Injectable()
export class GridFSService {
  private bucket: mongo.GridFSBucket;

  constructor(@InjectConnection() private readonly connection: Connection) {
    this.bucket = new mongo.GridFSBucket(this.connection.db!, { bucketName: 'fs' });
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
    return new Promise((resolve, reject) => {
      const uploadStream = this.bucket.openUploadStream(filename, {
        metadata: { contentType },
      });

      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);

      readableStream
        .pipe(uploadStream)
        .on('finish', () => {
          resolve(uploadStream.id as Types.ObjectId);
        })
        .on('error', async (error) => {
          try {
            await this.delete(uploadStream.id as Types.ObjectId);
          } catch (cleanupError) {
            // Ignore cleanup error, propagate original error
          }
          reject(new InternalServerErrorException(`GridFS upload failed: ${error.message}`));
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
    const fileInfo = await this.getFileInfo(fileId);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const downloadStream = this.bucket.openDownloadStream(fileId);

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
          reject(new NotFoundException(`Failed to download file from GridFS: ${error.message}`));
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
      return this.bucket.openDownloadStream(fileId, options);
    } catch (error) {
      throw new NotFoundException(`File with ID ${fileId} not found in GridFS: ${(error as Error).message}`);
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
    const files = await this.bucket.find({ _id: fileId }).toArray();
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
    try {
      await this.bucket.delete(fileId);
    } catch (error) {
      throw new InternalServerErrorException(`Failed to delete GridFS file: ${(error as Error).message}`);
    }
  }
}
