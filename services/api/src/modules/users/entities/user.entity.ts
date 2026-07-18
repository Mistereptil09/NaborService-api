import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import {
  MessagePolicyEnum,
  UserRoleEnum,
  VisibilityEnum,
} from '../../../common/enums';

@Entity('users')
@Check('chk_users_points_balance', '"points_balance" >= 0')
@Index('idx_users_neighbourhood', ['neighbourhoodId'])
@Index('idx_users_role', ['role'])
@Index('idx_users_deleted_at', ['deletedAt'])
export class User {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ name: 'first_name', type: 'varchar', nullable: false })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', nullable: false })
  lastName: string;

  @Column({ type: 'varchar', unique: true, nullable: false })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', nullable: false })
  passwordHash: string;

  @Column({ name: 'totp_secret', type: 'varchar', nullable: true })
  totpSecret: string | null;

  @Column({
    name: 'stripe_account_id',
    type: 'varchar',
    unique: true,
    nullable: true,
  })
  stripeAccountId: string | null;

  @Column({
    name: 'payouts_enabled',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  payoutsEnabled: boolean;

  @Column({ name: 'points_balance', type: 'int', nullable: false, default: 0 })
  pointsBalance: number;

  @Column({ name: 'neighbourhood_id', type: 'text', nullable: true })
  neighbourhoodId: string | null;

  @Column({
    type: 'enum',
    enum: VisibilityEnum,
    enumName: 'visibility_enum',
    default: VisibilityEnum.PUBLIC,
  })
  visibility: VisibilityEnum;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({
    name: 'message_policy',
    type: 'enum',
    enum: MessagePolicyEnum,
    enumName: 'message_policy_enum',
    default: MessagePolicyEnum.OPEN,
  })
  messagePolicy: MessagePolicyEnum;

  @Column({ type: 'varchar', length: 5, nullable: false, default: 'fr' })
  locale: string;

  @Column({ name: 'profile_picture_mongo_id', type: 'text', nullable: true })
  profilePictureMongoId: string | null;

  @Column({ name: 'banner_mongo_id', type: 'text', nullable: true })
  bannerMongoId: string | null;

  @Column({
    type: 'enum',
    enum: UserRoleEnum,
    enumName: 'user_role_enum',
    default: UserRoleEnum.RESIDENT,
  })
  role: UserRoleEnum;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ name: 'is_suspended', type: 'boolean', default: false })
  isSuspended: boolean;

  @Column({ name: 'suspended_at', type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
