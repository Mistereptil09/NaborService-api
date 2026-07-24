import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { PollTypeEnum } from '../../../common/enums';
import { User } from '../../users/entities/user.entity';
import { PollOption } from './poll-option.entity';

@Entity('polls')
@Check('chk_poll_dates', '"ends_at" IS NULL OR "ends_at" > "starts_at"')
@Index('idx_polls_active', ['neighbourhoodId', 'endsAt'])
@Index('idx_polls_creator', ['creatorId'])
@Index('idx_polls_group', ['groupId'])
export class Poll {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ type: 'varchar', nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'creator_id', type: 'uuid', nullable: false })
  creatorId: string;

  @Column({ name: 'neighbourhood_id', type: 'text', nullable: true })
  neighbourhoodId: string | null;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

  @Column({
    name: 'poll_type',
    type: 'enum',
    enum: PollTypeEnum,
    enumName: 'poll_type_enum',
    default: PollTypeEnum.SINGLE,
  })
  pollType: PollTypeEnum;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({
    name: 'is_anonymous',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  isAnonymous: boolean;

  @Column({
    name: 'is_weighted',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  isWeighted: boolean;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'closed_by' })
  closedByUser: User | null;

  @OneToMany(() => PollOption, (opt) => opt.poll)
  options: PollOption[];
}
