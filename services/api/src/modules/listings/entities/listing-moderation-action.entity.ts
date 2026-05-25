import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ModerationActionEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { Listing } from './listing.entity';

@Entity('listing_moderation_actions')
@Index('idx_listing_moderation_actions_listing', ['listingId'])
export class ListingModerationAction {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'listing_id', type: 'uuid', nullable: false })
  listingId: string;

  @Column({ name: 'moderator_id', type: 'uuid', nullable: false })
  moderatorId: string;

  @Column({
    type: 'enum',
    enum: ModerationActionEnum,
    enumName: 'moderation_action_enum',
  })
  action: ModerationActionEnum;

  @Column({ type: 'text', nullable: false })
  reason: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Listing)
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'moderator_id' })
  moderator: User;
}
