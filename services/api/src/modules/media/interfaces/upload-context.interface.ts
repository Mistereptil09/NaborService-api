import { OwnerType } from './upload-options.interface';

export interface UploadContext {
  ownerType: OwnerType;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}
