import { NotificationType } from './entities/notification.entity';
import { NotifPreferenceKey } from '../../queue/interfaces/job-payloads';

/**
 * How a notification type is relayed by email when the recipient is offline.
 * - essential: transactional — always sent, bypasses opt-out.
 * - preferenceKey: opt-out flag checked by the mail worker (non-essential only).
 * - subject / templateName: passed to the `email` queue.
 *
 * The opt-out and locale are applied ONCE, in the mail worker — not here.
 */
export interface NotificationRoute {
  essential: boolean;
  preferenceKey?: NotifPreferenceKey;
  subject: string;
  templateName: string;
}

export const NOTIFICATION_ROUTING: Record<NotificationType, NotificationRoute> =
  {
    // ── Social / discovery — gated by the matching preference ──
    new_follower: {
      essential: false,
      preferenceKey: 'notifNewFollower',
      subject: 'Vous avez un nouvel abonné',
      templateName: 'notification',
    },
    new_event: {
      essential: false,
      preferenceKey: 'notifNewEvent',
      subject: 'Un nouvel événement dans votre quartier',
      templateName: 'notification',
    },
    new_poll: {
      essential: false,
      preferenceKey: 'notifNewPoll',
      subject: 'Un nouveau sondage dans votre quartier',
      templateName: 'notification',
    },
    new_message: {
      essential: false,
      preferenceKey: 'notifMessage',
      subject: 'Vous avez un nouveau message',
      templateName: 'notification',
    },
    waitlist_place: {
      essential: false,
      preferenceKey: 'notifWaitlist',
      subject: 'Une place s’est libérée !',
      templateName: 'waitlist-promoted',
    },

    // ── Transactional — essential, always sent ──
    new_listing_interest: {
      essential: true,
      subject: 'Quelqu’un est intéressé par votre annonce',
      templateName: 'notification',
    },
    listing_accepted: {
      essential: true,
      subject: 'Votre demande a été acceptée',
      templateName: 'notification',
    },
    contract_pending: {
      essential: true,
      subject: 'Un contrat est en attente de signature',
      templateName: 'notification',
    },
    contract_signed: {
      essential: true,
      subject: 'Votre contrat a été signé',
      templateName: 'notification',
    },
    contract_fully_signed: {
      essential: true,
      subject: 'Toutes les parties ont signé le contrat',
      templateName: 'notification',
    },
    event_cancelled: {
      essential: true,
      subject: 'Un événement a été annulé',
      templateName: 'notification',
    },
    incident_resolved: {
      essential: true,
      subject: 'Votre signalement a été résolu',
      templateName: 'notification',
    },
    // Triggered by the Stripe teammate's code, not here — mapping kept for the worker.
    payment_confirmed: {
      essential: true,
      subject: 'Votre paiement a été confirmé',
      templateName: 'notification',
    },
    missed_call: {
      essential: true,
      subject: 'Appel manqué',
      templateName: 'notification',
    },
    call_summary: {
      essential: true,
      subject: 'Appel terminé',
      templateName: 'notification',
    },
  };
