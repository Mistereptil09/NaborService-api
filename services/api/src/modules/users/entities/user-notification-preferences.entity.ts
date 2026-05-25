import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_notification_preferences')
export class UserNotificationPreferences {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    name: 'notif_new_follower',
    type: 'boolean',
    nullable: false,
    default: true,
  })
  notifNewFollower: boolean;

  @Column({
    name: 'notif_new_listing',
    type: 'boolean',
    nullable: false,
    default: true,
  })
  notifNewListing: boolean;

  @Column({
    name: 'notif_new_event',
    type: 'boolean',
    nullable: false,
    default: true,
  })
  notifNewEvent: boolean;

  @Column({
    name: 'notif_new_poll',
    type: 'boolean',
    nullable: false,
    default: true,
  })
  notifNewPoll: boolean;

  @Column({
    name: 'notif_waitlist',
    type: 'boolean',
    nullable: false,
    default: true,
  })
  notifWaitlist: boolean;

  @Column({
    name: 'notif_message',
    type: 'boolean',
    nullable: false,
    default: true,
  })
  notifMessage: boolean;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;
}
