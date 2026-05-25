import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('evenements_category')
export class EvenementsCategory {
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

  @ManyToOne(() => EvenementsCategory, { nullable: true })
  @JoinColumn({ name: 'parent_category' })
  parentCategory: EvenementsCategory | null;

  @OneToMany(() => EvenementsCategory, (cat) => cat.parentCategory)
  children: EvenementsCategory[];
}
