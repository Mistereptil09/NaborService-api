import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ListingStatusEnum, ListingTypeEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { ListingCategory } from './listing-category.entity';

@Entity('listings')
@Check('chk_listing_price', '"price_cents" >= 0')
@Index('idx_listings_feed', ['neighbourhoodId', 'status', 'createdAt'])
@Index('idx_listings_creator', ['creatorId'])
@Index('idx_listings_soft_delete', ['deletedAt'])
export class Listing {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'creator_id', type: 'uuid', nullable: false })
  creatorId: string;

  @Column({ type: 'varchar', nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @Column({
    name: 'listing_type',
    type: 'enum',
    enum: ListingTypeEnum,
    enumName: 'listing_type_enum',
  })
  listingType: ListingTypeEnum;

  @Column({ name: 'price_cents', type: 'int', nullable: false, default: 0 })
  priceCents: number;

  @Column({
    type: 'enum',
    enum: ListingStatusEnum,
    enumName: 'listing_status_enum',
    default: ListingStatusEnum.OPEN,
  })
  status: ListingStatusEnum;

  @Column({ name: 'neighbourhood_id', type: 'text', nullable: true })
  neighbourhoodId: string | null;

  @Column({ name: 'mongo_document_id', type: 'text', nullable: true })
  mongoDocumentId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @ManyToOne(() => ListingCategory, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: ListingCategory | null;
}
