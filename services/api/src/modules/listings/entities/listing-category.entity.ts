import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('listing_category')
export class ListingCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'parent_category', type: 'int', nullable: true })
  parentCategoryId: number | null;

  @Column({ name: 'category_name', type: 'varchar', nullable: false })
  categoryName: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @ManyToOne(() => ListingCategory, { nullable: true })
  @JoinColumn({ name: 'parent_category' })
  parentCategory: ListingCategory | null;

  @OneToMany(() => ListingCategory, (cat) => cat.parentCategory)
  children: ListingCategory[];
}
