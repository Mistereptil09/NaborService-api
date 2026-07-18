import {
  Injectable,
  BadRequestException,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { GridFSService } from './gridfs.service';
import { UploadContext, ProcessedFile } from '../interfaces';

@Injectable()
export class UploadPipeline {
  private readonly logger = new Logger(UploadPipeline.name);

  constructor(private readonly gridfsService: GridFSService) {}

  /**
   * Process and store a file. Applies format conversion based on MIME type.
   * @returns Processed file info including GridFS file ID and final metadata
   */
  async process(
    file: Express.Multer.File,
    context: UploadContext,
  ): Promise<ProcessedFile> {
    // multer/busboy decode multipart filename headers as latin1 regardless of
    // the browser's actual UTF-8 encoding, corrupting accented filenames (e.g.
    // "DÃ©claration...2Ã¨me..." instead of "Déclaration...2ème..."). Re-decoding
    // here fixes it for every upload path; a no-op for pure-ASCII filenames.
    file.originalname = Buffer.from(file.originalname, 'latin1').toString(
      'utf8',
    );

    this.validateFile(file, context);

    let processedBuffer = file.buffer;
    let finalMimetype = file.mimetype;
    let widthPx: number | undefined;
    let heightPx: number | undefined;
    let durationSeconds: number | undefined;

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
        const transcoded = await this.transcodeAudio(file.buffer);
        processedBuffer = transcoded.buffer;
        durationSeconds = transcoded.durationSeconds;
        // The transcoded file is an Ogg container carrying Opus audio.
        // 'audio/opus' names the raw RTP payload type (RFC 7587), not a file
        // format — browsers don't map it to any demuxer for a plain <audio
        // src>, so playback fails outright. 'audio/ogg' is the correct type
        // for this exact container+codec (also what Firefox's own recorder
        // produces, per useVoiceRecorder.ts's pickFormat()).
        finalMimetype = 'audio/ogg';
      }
    } catch (error) {
      if (isImage) {
        this.logger.error(
          `Image processing failed: ${(error as Error).message}`,
        );
        throw new BadRequestException(
          'Image processing error: unable to convert to WebP',
        );
      } else if (isVideo) {
        this.logger.error(
          `Video processing failed: ${(error as Error).message}`,
        );
        throw new BadRequestException(
          'Video processing error: unable to compress video',
        );
      } else if (isAudio) {
        this.logger.error(
          `Audio processing failed: ${(error as Error).message}`,
        );
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
      durationSeconds,
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
    // NOT join(process.cwd(), ...): in dev, process.cwd() is /app, which is
    // bind-mounted from the host (compose.dev.yml) — every read/write here
    // would go through Docker Desktop's slow virtualized file sharing instead
    // of the container's own filesystem, making transcoding look catastrophically
    // slow even though ffmpeg itself runs in ~1-2s (see os.tmpdir(), unaffected).
    const tempDir = join(tmpdir(), 'nabor-media');
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
          .outputOptions([
            // Without this, ffmpeg's mp4 muxer writes the moov atom (index)
            // at the END of the file — a full download still works (all bytes
            // arrive eventually), but a browser trying to preview/stream it
            // has to buffer the entire file first, since it can't find the
            // index until it reaches the end. This is why playback looked
            // stuck/never-loading regardless of file size.
            '-movflags',
            '+faststart',
            // Without this, libx264 preserves the source's chroma subsampling
            // (e.g. yuv422p/yuv444p, common from some phones/screen recorders)
            // instead of the yuv420p browsers require to decode H.264 at all —
            // that's the "no video with a supported format/MIME type was found"
            // error, distinct from the faststart issue above (a plain byte
            // download still "works" either way since it never decodes anything).
            '-pix_fmt',
            'yuv420p',
          ])
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
   * Transcode audio to Opus at 128kbps using ffmpeg. Ogg has no header-level
   * duration (unlike MP4's moov atom), so browsers playing it back over HTTP
   * range requests can't reliably determine it themselves — probing the
   * transcoded output here and storing it lets the UI show a correct duration
   * immediately instead of "0:00" until playback/seeking resolves it.
   */
  private async transcodeAudio(
    buffer: Buffer,
  ): Promise<{ buffer: Buffer; durationSeconds: number }> {
    // NOT join(process.cwd(), ...): in dev, process.cwd() is /app, which is
    // bind-mounted from the host (compose.dev.yml) — every read/write here
    // would go through Docker Desktop's slow virtualized file sharing instead
    // of the container's own filesystem, making transcoding look catastrophically
    // slow even though ffmpeg itself runs in ~1-2s (see os.tmpdir(), unaffected).
    const tempDir = join(tmpdir(), 'nabor-media');
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

      const durationSeconds = await this.getAudioDuration(outputPath);
      const outBuffer = await fs.readFile(outputPath);
      return { buffer: outBuffer, durationSeconds };
    } finally {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    }
  }

  private async getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(Math.round(metadata.format.duration ?? 0));
      });
    });
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
