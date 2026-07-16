import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ChatGroupTypeEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';

@Entity('chat_groups')
@Index('idx_chat_groups_type', ['type'])
@Index('idx_chat_groups_listing', ['listingId'])
@Index('idx_chat_groups_neighbourhood', ['neighbourhoodId'])
export class ChatGroup {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @Column({
    type: 'enum',
    enum: ChatGroupTypeEnum,
    enumName: 'chat_group_type_enum',
  })
  type: ChatGroupTypeEnum;

  @Column({ name: 'listing_id', type: 'uuid', nullable: true })
  listingId: string | null;

  /** Plain text, non-FK (no Postgres `neighbourhoods` table — neighbourhoods live in Neo4j only). */
  @Column({ name: 'neighbourhood_id', type: 'text', nullable: true })
  neighbourhoodId: string | null;

  @ManyToOne('Listing', { nullable: true })
  @JoinColumn({ name: 'listing_id' })
  listing: any | null;

  @Column({ name: 'encrypted_group_key', type: 'text', nullable: true })
  encryptedGroupKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
