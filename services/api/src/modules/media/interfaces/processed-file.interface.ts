import { Types } from 'mongoose';

export interface ProcessedFile {
  gridfsFileId: Types.ObjectId;
  mimetype: string;
  sizeBytes: number;
  widthPx?: number;
  heightPx?: number;
  durationSeconds?: number;
  originalFilename: string;
}
