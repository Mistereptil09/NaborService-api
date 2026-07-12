export interface Neo4jSyncJobPayload {
  operation:
    | 'upsert-user'
    | 'upsert-listing'
    | 'upsert-event'
    | 'update-relationship'
    | 'update-properties';
  data: Record<string, any>;
}

/**
 * Notification preference flags on UserNotificationPreferences that an email
 * may be gated behind. Mirrors the boolean columns of that entity.
 */
export type NotifPreferenceKey =
  | 'notifNewFollower'
  | 'notifNewListing'
  | 'notifNewEvent'
  | 'notifNewPoll'
  | 'notifWaitlist'
  | 'notifMessage';

export interface EmailJobPayload {
  recipient: string;
  subject: string;
  /** Selects the Handlebars template file only — NOT used for opt-out. */
  templateName: string;
  templateVariables: Record<string, any>;
  /**
   * Transactional email (reset password, security, moderation): always sent,
   * bypasses opt-out. When true, `preferenceKey` is ignored.
   */
  essential?: boolean;
  /** Preference to check when the email is NOT essential. */
  preferenceKey?: NotifPreferenceKey;
  /** Override recipient locale; otherwise resolved from user.locale, fallback 'fr'. */
  locale?: 'fr' | 'en';
}

export interface PdfGenerationJobPayload {
  transactionId: string;
}

export interface StripeWebhookJobPayload {
  eventType: string;
  eventId: string;
  eventData: Record<string, any>;
}

export interface WaitlistPromoteJobPayload {
  eventId: string;
  userId: string;
}

export interface RgpdAnonymiseJobPayload {
  userId: string;
  scope: string[];
}

export interface CryptoRotationJobPayload {
  pgGroupId: string;
  newKeyReference: string;
  messageIds: string[];
}

export interface EventRegisterJobPayload {
  eventId: string;
  userId: string;
}

export interface ContractExpirationJobPayload {
  transactionId: string;
}

export interface CallTimeoutJobPayload {
  callId: string;
}
