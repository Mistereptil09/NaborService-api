export function stripeJobId(eventId: string): string {
  return eventId;
}

export function waitlistJobId(eventId: string, userId: string): string {
  return `${eventId}:${userId}`;
}

export function eventRegisterJobId(eventId: string, userId: string): string {
  return `${eventId}:${userId}`;
}
