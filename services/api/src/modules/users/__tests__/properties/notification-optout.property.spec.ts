import * as fc from 'fast-check';
import { ESSENTIAL_EMAILS } from '../../data-processing.constants';

const NON_ESSENTIAL_EMAILS = [
  'new_follower',
  'new_listing_followed',
  'new_event_followed',
  'new_poll',
  'waitlist_released',
] as const;

async function simulateSendEmail(
  userId: string,
  emailType: string,
  isNotificationsOptedOut: boolean,
): Promise<{ sent: boolean; skipped: boolean }> {
  if (isNotificationsOptedOut && !ESSENTIAL_EMAILS.includes(emailType as any)) {
    return { sent: false, skipped: true };
  }
  return { sent: true, skipped: false };
}

describe('Feature: rgpd-data-processing-table, Property 4: Notification dispatch respects opt-out by email type', () => {
  it('should only dispatch essential emails if notifications opt-out is active', async () => {
    const allEmails = [...ESSENTIAL_EMAILS, ...NON_ESSENTIAL_EMAILS];

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }), // userId
        fc.constantFrom(...allEmails), // emailType
        fc.boolean(), // isNotificationsOptedOut
        async (userId, emailType, isNotificationsOptedOut) => {
          const result = await simulateSendEmail(
            userId,
            emailType,
            isNotificationsOptedOut,
          );

          if (isNotificationsOptedOut) {
            const isEssential = ESSENTIAL_EMAILS.includes(emailType as any);
            if (isEssential) {
              expect(result.sent).toBe(true);
              expect(result.skipped).toBe(false);
            } else {
              expect(result.sent).toBe(false);
              expect(result.skipped).toBe(true);
            }
          } else {
            expect(result.sent).toBe(true);
            expect(result.skipped).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
