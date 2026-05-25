import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MessagePolicyEnum, VisibilityEnum } from '../../../common/enums';
import { PROCESSING_TYPES } from '../data-processing.constants';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsEnum(VisibilityEnum)
  visibility?: VisibilityEnum;

  @IsOptional()
  @IsEnum(MessagePolicyEnum)
  messagePolicy?: MessagePolicyEnum;

  @IsOptional()
  @IsString()
  neighbourhoodId?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  totpCode?: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'newPassword must be at least 8 characters long' })
  newPassword!: string;

  @IsString()
  @IsNotEmpty()
  totpCode!: string;
}

export class ChangeEmailDto {
  @IsEmail()
  newEmail!: string;

  @IsString()
  @IsNotEmpty()
  totpCode!: string;
}

export class PasswordResetRequestDto {
  @IsEmail()
  email!: string;
}

export class PasswordResetConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8, { message: 'newPassword must be at least 8 characters long' })
  newPassword!: string;
}

export class UpdateLocaleDto {
  @IsIn(['fr', 'en'])
  locale!: string;
}

export class UpdateNotifPrefsDto {
  @IsOptional()
  @IsBoolean()
  notifNewFollower?: boolean;

  @IsOptional()
  @IsBoolean()
  notifNewListing?: boolean;

  @IsOptional()
  @IsBoolean()
  notifNewEvent?: boolean;

  @IsOptional()
  @IsBoolean()
  notifNewPoll?: boolean;

  @IsOptional()
  @IsBoolean()
  notifWaitlist?: boolean;

  @IsOptional()
  @IsBoolean()
  notifMessage?: boolean;
}

export class RectifyDataDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @IsNotEmpty()
  totpCode!: string;
}

export class OptOutDto {
  @IsIn([...PROCESSING_TYPES])
  processingType!: string;
}

export class SwipeDto {
  @IsIn(['like', 'dislike'])
  direction!: string;
}

export class ReportUserDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class PaginationDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset: number = 0;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit: number = 20;
}
