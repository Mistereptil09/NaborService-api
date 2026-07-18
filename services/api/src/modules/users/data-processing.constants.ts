export const PROCESSING_TYPES = [
  'discovery',
  'notifications',
  'neo4j_tracking',
] as const;
export type ProcessingType = (typeof PROCESSING_TYPES)[number];

export const ESSENTIAL_RELATIONS = [
  'LIVES_IN',
  'FOLLOWS',
  'FRIENDS_WITH',
  'BLOCKS',
] as const;
export const INTERACTION_RELATIONS = [
  'LIKED_LISTING',
  'LIKED_EVENT',
  'VIEWED_LISTING',
  'INTERESTED_IN',
] as const;

export const ESSENTIAL_EMAILS = [
  'registration_confirmation',
  'password_reset',
  'payment_confirmation',
  'contract_signed',
  'contract_fully_signed',
] as const;
