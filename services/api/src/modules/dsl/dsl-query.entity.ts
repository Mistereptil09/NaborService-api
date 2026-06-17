import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('dsl_queries')
export class DslQuery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @Column('varchar')
  userRole!: string;

  @Column('text')
  query!: string;

  @Column('varchar')
  collection!: string;

  @Column('jsonb', { nullable: true })
  filter!: Record<string, unknown> | null;

  @Column('jsonb', { nullable: true })
  order!: Record<string, unknown> | null;

  @Column('int', { default: 100 })
  limit!: number;

  @Column('int', { nullable: true })
  resultCount!: number | null;

  @Column('boolean', { default: false })
  hasError!: boolean;

  @Column('text', { nullable: true })
  errorMessage!: string | null;

  @Column('varchar', { nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
