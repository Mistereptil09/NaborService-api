import {
  Injectable,
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { GridFSService } from './gridfs.service';
import { UploadContext, ProcessedFile } from '../interfaces';

@Injectable()
export class UploadPipeline {
  constructor(private readonly gridfsService: GridFSService) {}

  /**
   * Process and store a file. Applies format conversion based on MIME type.
   * @returns Processed file info including GridFS file ID and final metadata
   */
  async process(
    file: Express.Multer.File,
    context: UploadContext,
  ): Promise<ProcessedFile> {
    this.validateFile(file, context);

    let processedBuffer = file.buffer;
    let finalMimetype = file.mimetype;
    let widthPx: number | undefined;
    let heightPx: number | undefined;

    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    const isAudio = file.mimetype.startsWith('audio/');

    try {
      if (isImage) {
        if (file.mimetype === 'image/webp') {
          const metadata = await sharp(file.buffer).metadata();
          widthPx = metadata.width;
          heightPx = metadata.height;
        } else {
          const sharpImg = sharp(file.buffer);
          const metadata = await sharpImg.metadata();
          widthPx = metadata.width;
          heightPx = metadata.height;

          processedBuffer = await sharpImg.webp({ quality: 80 }).toBuffer();
          finalMimetype = 'image/webp';
        }
      } else if (isVideo) {
        processedBuffer = await this.compressVideo(file.buffer);
        finalMimetype = 'video/mp4';
      } else if (isAudio) {
        processedBuffer = await this.transcodeAudio(file.buffer);
        finalMimetype = 'audio/opus';
      }
    } catch (error) {
      if (isImage) {
        throw new BadRequestException(
          'Image processing error: unable to convert to WebP',
        );
      } else if (isVideo) {
        throw new BadRequestException(
          'Video processing error: unable to compress video',
        );
      } else if (isAudio) {
        throw new BadRequestException(
          'Audio processing error: unable to transcode audio',
        );
      }
      throw new BadRequestException(
        `Processing error: ${(error as Error).message}`,
      );
    }

    const gridfsFileId = await this.gridfsService.upload(
      processedBuffer,
      file.originalname,
      finalMimetype,
    );

    return {
      gridfsFileId,
      mimetype: finalMimetype,
      sizeBytes: processedBuffer.length,
      widthPx,
      heightPx,
      originalFilename: file.originalname,
    };
  }

  /**
   * Validate file against context-specific constraints (size, MIME type).
   * Throws appropriate HTTP exceptions on failure.
   */
  private validateFile(
    file: Express.Multer.File,
    context: UploadContext,
  ): void {
    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required');
    }

    if (!file.originalname || file.originalname.length > 255) {
      throw new BadRequestException('Filename must be 1-255 characters');
    }

    if (!context.allowedMimeTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `MIME type ${file.mimetype} is not allowed for ${context.ownerType}`,
      );
    }

    if (file.size > context.maxSizeBytes) {
      throw new PayloadTooLargeException(
        `File size exceeds maximum of ${context.maxSizeBytes} bytes for ${context.ownerType}`,
      );
    }
  }

  /**
   * Compress video to max 1080p using ffmpeg.
   */
  private async compressVideo(buffer: Buffer): Promise<Buffer> {
    const tempDir = join(process.cwd(), 'tmp-media');
    await fs.mkdir(tempDir, { recursive: true });

    const inputPath = join(
      tempDir,
      `input-${Date.now()}-${Math.random().toString(36).substring(7)}.tmp`,
    );
    const outputPath = join(
      tempDir,
      `output-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`,
    );

    try {
      await fs.writeFile(inputPath, buffer);

      const dimensions = await this.getVideoDimensions(inputPath);
      const scaleFilter = this.getScaleFilter(
        dimensions.width,
        dimensions.height,
      );

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .output(outputPath)
          .videoCodec('libx264')
          .videoFilters(scaleFilter)
          .audioCodec('aac')
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      return await fs.readFile(outputPath);
    } finally {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    }
  }

  /**
   * Transcode audio to Opus at 128kbps using ffmpeg.
   */
  private async transcodeAudio(buffer: Buffer): Promise<Buffer> {
    const tempDir = join(process.cwd(), 'tmp-media');
    await fs.mkdir(tempDir, { recursive: true });

    const inputPath = join(
      tempDir,
      `input-${Date.now()}-${Math.random().toString(36).substring(7)}.tmp`,
    );
    const outputPath = join(
      tempDir,
      `output-${Date.now()}-${Math.random().toString(36).substring(7)}.ogg`,
    );

    try {
      await fs.writeFile(inputPath, buffer);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .output(outputPath)
          .audioCodec('libopus')
          .audioBitrate('128k')
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      return await fs.readFile(outputPath);
    } finally {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    }
  }

  private async getVideoDimensions(
    inputPath: string,
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        const stream = metadata.streams.find((s) => s.codec_type === 'video');
        if (!stream) {
          reject(new Error('No video stream found'));
          return;
        }
        resolve({
          width: stream.width || 0,
          height: stream.height || 0,
        });
      });
    });
  }

  private getScaleFilter(width: number, height: number): string {
    if (width <= 1920 && height <= 1080) {
      return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    }
    const ratio = Math.min(1920 / width, 1080 / height);
    const newWidth = Math.round((width * ratio) / 2) * 2;
    const newHeight = Math.round((height * ratio) / 2) * 2;
    return `scale=${newWidth}:${newHeight}`;
  }
}
