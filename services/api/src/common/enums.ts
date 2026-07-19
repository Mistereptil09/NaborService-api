export enum VisibilityEnum {
  PUBLIC = 'public',
  FRIENDS = 'friends',
  PRIVATE = 'private',
}

export enum MessagePolicyEnum {
  OPEN = 'open',
  FILTERED = 'filtered',
  CLOSED = 'closed',
}

export enum UserRoleEnum {
  RESIDENT = 'resident',
  NEIGHBOURHOOD_REP = 'neighbourhood_rep',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
}

export enum SwipeDirectionEnum {
  LIKE = 'like',
  DISLIKE = 'dislike',
}

export enum ChatGroupTypeEnum {
  DIRECT_MESSAGE = 'direct_message',
  GROUP_CHAT = 'group_chat',
  NEIGHBOURHOOD = 'neighbourhood',
}

export enum GroupRoleEnum {
  WATCH = 'watch',
  MESSAGE = 'message',
  ACTIONS = 'actions',
  ADMIN = 'admin',
}

export enum ListingTypeEnum {
  OFFER = 'offer',
  REQUEST = 'request',
}

export enum ListingStatusEnum {
  OPEN = 'open',
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum TransactionStatusEnum {
  PENDING = 'pending',
  COMPLETED = 'completed',
  PAYMENT_FAILED = 'payment_failed',
  CANCELLED = 'cancelled',
}

export enum ModerationActionEnum {
  CANCELLED = 'cancelled',
  WARNED = 'warned',
  RESTORED = 'restored',
}

export enum EventStatusEnum {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  OPEN = 'open',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export enum ParticipantStatusEnum {
  REGISTERED = 'registered',
  WAITLISTED = 'waitlisted',
  CANCELLED = 'cancelled',
}

export enum PaymentStatusEnum {
  FREE = 'free',
  PENDING = 'pending',
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
}

export enum PollTypeEnum {
  SINGLE = 'single',
  MULTIPLE = 'multiple',
  WEIGHTED = 'weighted',
}

export enum IncidentSeverityEnum {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IncidentStatusEnum {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
}

export enum CallTypeEnum {
  AUDIO = 'audio',
  VIDEO = 'video',
}

/**
 * 'ringing'/'active' only ever exist in Redis (live call state) — the
 * Postgres CallLog only ever gets written with a final status.
 */
export enum CallStatusEnum {
  RINGING = 'ringing',
  ACTIVE = 'active',
  ENDED = 'ended',
  MISSED = 'missed',
  DECLINED = 'declined',
}

export enum CallParticipantStatusEnum {
  INVITED = 'invited',
  JOINED = 'joined',
  DECLINED = 'declined',
  LEFT = 'left',
  MISSED = 'missed',
}

export enum PointsLedgerEntryTypeEnum {
  TOPUP = 'topup',
  LISTING_HOLD = 'listing_hold',
  LISTING_PAYOUT = 'listing_payout',
  LISTING_REFUND = 'listing_refund',
  LISTING_COMMISSION = 'listing_commission',
  EVENT_HOLD = 'event_hold',
  EVENT_PAYOUT = 'event_payout',
  EVENT_REFUND = 'event_refund',
  EVENT_COMMISSION = 'event_commission',
  EVENT_REWARD = 'event_reward',
  ADJUSTMENT = 'adjustment',
  ADMIN_ADJUSTMENT = 'admin_adjustment',
  CASHOUT = 'cashout',
  CASHOUT_REVERSED = 'cashout_reversed',
}

export enum PointsTopupStatusEnum {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum PointsCashoutStatusEnum {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
