import { NotificationType } from './entities/notification.entity';
import { NotifPreferenceKey } from '../../queue/interfaces/job-payloads';

export interface NotificationRoute {
  essential: boolean;
  preferenceKey?: NotifPreferenceKey;
  subject: string;
  subjectEn: string;
  templateName: string;
}

export const NOTIFICATION_ROUTING: Record<NotificationType, NotificationRoute> =
  {
    new_follower: {
      essential: false,
      preferenceKey: 'notifNewFollower',
      subject: 'Vous avez un nouvel abonné',
      subjectEn: 'You have a new follower',
      templateName: 'notification',
    },
    new_event: {
      essential: false,
      preferenceKey: 'notifNewEvent',
      subject: 'Un nouvel événement dans votre quartier',
      subjectEn: 'A new event in your neighbourhood',
      templateName: 'notification',
    },
    new_poll: {
      essential: false,
      preferenceKey: 'notifNewPoll',
      subject: 'Un nouveau sondage dans votre quartier',
      subjectEn: 'A new poll in your neighbourhood',
      templateName: 'notification',
    },
    new_message: {
      essential: false,
      preferenceKey: 'notifMessage',
      subject: 'Vous avez un nouveau message',
      subjectEn: 'You have a new message',
      templateName: 'notification',
    },
    waitlist_place: {
      essential: false,
      preferenceKey: 'notifWaitlist',
      subject: 'Une place s’est libérée !',
      subjectEn: 'A spot just opened up!',
      templateName: 'waitlist-promoted',
    },

    new_listing_interest: {
      essential: true,
      subject: 'Quelqu’un est intéressé par votre annonce',
      subjectEn: 'Someone is interested in your listing',
      templateName: 'notification',
    },
    listing_accepted: {
      essential: true,
      subject: 'Votre demande a été acceptée',
      subjectEn: 'Your request has been accepted',
      templateName: 'notification',
    },
    contract_pending: {
      essential: true,
      subject: 'Un contrat est en attente de signature',
      subjectEn: 'A contract is awaiting signature',
      templateName: 'notification',
    },
    contract_signed: {
      essential: true,
      subject: 'Votre contrat a été signé',
      subjectEn: 'Your contract has been signed',
      templateName: 'notification',
    },
    contract_fully_signed: {
      essential: true,
      subject: 'Toutes les parties ont signé le contrat',
      subjectEn: 'All parties have signed the contract',
      templateName: 'notification',
    },
    event_cancelled: {
      essential: true,
      subject: 'Un événement a été annulé',
      subjectEn: 'An event has been cancelled',
      templateName: 'notification',
    },
    incident_resolved: {
      essential: true,
      subject: 'Votre signalement a été résolu',
      subjectEn: 'Your report has been resolved',
      templateName: 'notification',
    },
    payment_confirmed: {
      essential: true,
      subject: 'Votre paiement a été confirmé',
      subjectEn: 'Your payment has been confirmed',
      templateName: 'notification',
    },
    missed_call: {
      essential: true,
      subject: 'Appel manqué',
      subjectEn: 'Missed call',
      templateName: 'notification',
    },
    call_summary: {
      essential: true,
      subject: 'Appel terminé',
      subjectEn: 'Call ended',
      templateName: 'notification',
    },
  };
