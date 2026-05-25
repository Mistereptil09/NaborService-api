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
