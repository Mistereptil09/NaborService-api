export type OwnerType =
  | 'user_avatar'
  | 'user_banner'
  | 'listing_photo'
  | 'event_cover'
  | 'event_attachment'
  | 'incident_photo'
  | 'message_attachment'
  | 'contract';

export interface UploadOptions {
  caption?: string | null;
  takenAt?: Date;
  syncedAt?: Date;
  contractType?: 'contract' | 'receipt';
}
