export interface Neo4jSyncJobPayload {
  operation:
    | 'upsert-user'
    | 'upsert-listing'
    | 'upsert-event'
    | 'update-relationship'
    | 'update-properties';
  data: Record<string, any>;
}

export interface EmailJobPayload {
  recipient: string;
  subject: string;
  templateName: string;
  templateVariables: Record<string, any>;
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
