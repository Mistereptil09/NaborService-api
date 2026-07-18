import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  MessagePolicyEnum,
  UserRoleEnum,
  VisibilityEnum,
} from '../../../common/enums';
import { User } from '../entities/user.entity';
import { PaginationDto } from './user-routes.dtos';

export class AdminListUsersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: UserRoleEnum })
  @IsOptional()
  @IsEnum(UserRoleEnum)
  role?: UserRoleEnum;

  @ApiPropertyOptional({ description: 'Filtrer par identifiant de quartier' })
  @IsOptional()
  @IsString()
  neighbourhood_id?: string;

  @ApiPropertyOptional({ description: 'Recherche par nom, prénom ou email' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class AdminUserDto {
  @ApiProperty() id: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: UserRoleEnum }) role: UserRoleEnum;
  @ApiProperty({ enum: VisibilityEnum }) visibility: VisibilityEnum;
  @ApiProperty({ enum: MessagePolicyEnum }) messagePolicy: MessagePolicyEnum;
  @ApiProperty({ nullable: true }) bio: string | null;
  @ApiProperty() locale: string;
  @ApiProperty({ nullable: true }) neighbourhoodId: string | null;
  @ApiProperty({ nullable: true }) stripeAccountId: string | null;
  @ApiProperty({ description: 'Solde de points actuel' }) pointsBalance: number;
  @ApiProperty({ description: 'Éligible aux virements de cashout (onboarding Stripe Connect terminé)' })
  payoutsEnabled: boolean;
  @ApiProperty({ nullable: true }) profilePictureMongoId: string | null;
  @ApiProperty({ nullable: true }) bannerMongoId: string | null;
  @ApiProperty({
    description: 'Indique si la MFA TOTP est activée, sans exposer le secret',
  })
  mfaEnabled: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastLoginAt: Date | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  passwordChangedAt: Date | null;
  @ApiProperty() isSuspended: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  suspendedAt: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  updatedAt: Date | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  deletedAt: Date | null;
}

export class AdminUsersPaginationMetaDto {
  @ApiProperty() total: number;
  @ApiProperty() offset: number;
  @ApiProperty() limit: number;
}

export class AdminUsersListDto {
  @ApiProperty({ type: [AdminUserDto] }) data: AdminUserDto[];
  @ApiProperty({ type: AdminUsersPaginationMetaDto })
  meta: AdminUsersPaginationMetaDto;
}

export function toAdminUserDto(user: User): AdminUserDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    visibility: user.visibility,
    messagePolicy: user.messagePolicy,
    bio: user.bio,
    locale: user.locale,
    neighbourhoodId: user.neighbourhoodId,
    stripeAccountId: user.stripeAccountId,
    pointsBalance: user.pointsBalance,
    payoutsEnabled: user.payoutsEnabled,
    profilePictureMongoId: user.profilePictureMongoId,
    bannerMongoId: user.bannerMongoId,
    mfaEnabled: !!user.totpSecret,
    lastLoginAt: user.lastLoginAt,
    passwordChangedAt: user.passwordChangedAt,
    isSuspended: user.isSuspended,
    suspendedAt: user.suspendedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
  };
}
