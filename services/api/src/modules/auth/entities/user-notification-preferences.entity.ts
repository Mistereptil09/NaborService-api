import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_notification_preferences')
export class UserNotificationPreferences {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'notif_new_follower', type: 'boolean', default: true })
  notifNewFollower: boolean;

  @Column({ name: 'notif_new_listing', type: 'boolean', default: true })
  notifNewListing: boolean;

  @Column({ name: 'notif_new_event', type: 'boolean', default: true })
  notifNewEvent: boolean;

  @Column({ name: 'notif_new_poll', type: 'boolean', default: true })
  notifNewPoll: boolean;

  @Column({ name: 'notif_waitlist', type: 'boolean', default: true })
  notifWaitlist: boolean;

  @Column({ name: 'notif_message', type: 'boolean', default: true })
  notifMessage: boolean;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;
}
