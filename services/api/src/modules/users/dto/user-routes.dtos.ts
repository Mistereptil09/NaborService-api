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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessagePolicyEnum, VisibilityEnum } from '../../../common/enums';
import { PROCESSING_TYPES } from '../data-processing.constants';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: "Prénom de l'utilisateur",
    example: 'Jean',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiPropertyOptional({
    description: "Nom de famille de l'utilisateur",
    example: 'Dupont',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiPropertyOptional({
    description: "Biographie ou description de l'utilisateur",
    example: 'Passionné de bricolage et de jardinage.',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    description: 'Visibilité du profil',
    enum: VisibilityEnum,
    example: VisibilityEnum.PUBLIC,
  })
  @IsOptional()
  @IsEnum(VisibilityEnum)
  visibility?: VisibilityEnum;

  @ApiPropertyOptional({
    description: 'Politique de messagerie',
    enum: MessagePolicyEnum,
    example: MessagePolicyEnum.OPEN,
  })
  @IsOptional()
  @IsEnum(MessagePolicyEnum)
  messagePolicy?: MessagePolicyEnum;

  @ApiPropertyOptional({
    description: "ID du quartier de l'utilisateur",
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  neighbourhoodId?: string | null;

  @ApiPropertyOptional({
    description: "Adresse email de l'utilisateur",
    example: 'jean.dupont@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Code TOTP pour validation (si MFA activée)',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  totpCode?: string;
}

export class ChangePasswordDto {
  @ApiProperty({
    description: "Mot de passe actuel de l'utilisateur",
    example: 'AncienMotDePasse123!',
  })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({
    description: "Nouveau mot de passe de l'utilisateur",
    example: 'NouveauMotDePasse123!',
  })
  @IsString()
  @MinLength(8, { message: 'newPassword must be at least 8 characters long' })
  newPassword!: string;

  @ApiProperty({
    description: 'Code TOTP pour confirmation de sécurité',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  totpCode!: string;
}

export class ChangeEmailDto {
  @ApiProperty({
    description: "Nouvelle adresse email de l'utilisateur",
    example: 'nouveau.email@example.com',
  })
  @IsEmail()
  newEmail!: string;

  @ApiProperty({
    description: 'Code TOTP pour confirmation de sécurité',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  totpCode!: string;
}

export class PasswordResetRequestDto {
  @ApiProperty({
    description: 'Adresse email associée au compte à réinitialiser',
    example: 'jean.dupont@example.com',
  })
  @IsEmail()
  email!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty({
    description: 'Token de réinitialisation reçu par email',
    example: 'token-de-reinitialisation-123456',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({
    description: "Nouveau mot de passe de l'utilisateur",
    example: 'NouveauMotDePasse123!',
  })
  @IsString()
  @MinLength(8, { message: 'newPassword must be at least 8 characters long' })
  newPassword!: string;
}

export class UpdateLocaleDto {
  @ApiProperty({
    description: "Langue choisie pour l'interface de l'application",
    example: 'fr',
  })
  @IsIn(['fr', 'en'])
  locale!: string;
}

export class UpdateNotifPrefsDto {
  @ApiPropertyOptional({
    description:
      "Activer les notifications lors de l'obtention d'un nouveau follower",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  notifNewFollower?: boolean;

  @ApiPropertyOptional({
    description:
      "Activer les notifications lors de la publication d'une nouvelle annonce",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  notifNewListing?: boolean;

  @ApiPropertyOptional({
    description:
      "Activer les notifications lors de la création d'un nouvel événement",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  notifNewEvent?: boolean;

  @ApiPropertyOptional({
    description:
      "Activer les notifications lors du lancement d'un nouveau sondage",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  notifNewPoll?: boolean;

  @ApiPropertyOptional({
    description: "Activer les notifications concernant la liste d'attente",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  notifWaitlist?: boolean;

  @ApiPropertyOptional({
    description:
      "Activer les notifications lors de la réception d'un nouveau message",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  notifMessage?: boolean;
}

export class RectifyDataDto {
  @ApiPropertyOptional({
    description: 'Prénom rectifié',
    example: 'Jean-Claude',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Nom rectifié',
    example: 'Dupont-Durand',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Adresse email rectifiée',
    example: 'jeanclaude.dupont@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Code TOTP pour validation réglementaire (RGPD)',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  totpCode!: string;
}

export class OptOutDto {
  @ApiProperty({
    description:
      "Type de traitement pour lequel l'utilisateur exerce son droit d'opposition",
    example: 'marketing',
  })
  @IsIn([...PROCESSING_TYPES])
  processingType!: string;
}

export class SwipeDto {
  @ApiProperty({
    description:
      "Direction du swipe dans le fil de découverte ('like' ou 'dislike')",
    example: 'like',
  })
  @IsIn(['like', 'dislike'])
  direction!: string;
}

export class ReportUserDto {
  @ApiProperty({
    description: "Raison du signalement de l'utilisateur",
    example: 'Comportement inapproprié ou spam récurrent',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class PaginationDto {
  @ApiPropertyOptional({
    description: "Nombre d'éléments à sauter pour la pagination (offset)",
    example: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({
    description: "Nombre maximum d'éléments à retourner par page",
    example: 20,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit: number = 20;
}
