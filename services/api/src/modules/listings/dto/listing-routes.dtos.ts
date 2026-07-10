import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingTypeEnum, ListingStatusEnum } from '../../../common/enums';

export class ListListingsDto {
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
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Filtrer par identifiant de quartier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  neighbourhood?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par identifiant de catégorie',
    example: 3,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  category?: number;

  @ApiPropertyOptional({
    description: "Filtrer par type d'annonce ('offer' ou 'request')",
    example: 'offer',
  })
  @IsOptional()
  @IsIn(['offer', 'request'])
  type?: string;

  @ApiPropertyOptional({
    description: "Filtrer par statut de l'annonce",
    example: 'open',
  })
  @IsOptional()
  @IsIn(['open', 'pending', 'in_progress', 'closed', 'cancelled'])
  status?: string;
}

export class CreateListingDto {
  @ApiProperty({
    description: "Titre de l'annonce",
    example: 'Tondeuse à gazon thermique',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: "Type d'annonce ('offer' ou 'request')",
    example: 'offer',
  })
  @IsIn(['offer', 'request'])
  listing_type: string;

  @ApiPropertyOptional({
    description: "Description de l'annonce",
    example:
      "Je prête ma tondeuse pour le week-end en échange d'un coup de main pour le potager.",
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Identifiant de la catégorie associée',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @ApiPropertyOptional({
    description: 'Prix proposé en centimes (0 pour gratuit)',
    example: 1500,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  price_cents?: number;

  @ApiPropertyOptional({
    description: "Identifiant du quartier où l'annonce est proposée",
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  neighbourhood_id?: string;
}

export class UpdateListingDto {
  @ApiPropertyOptional({
    description: "Titre de l'annonce mis à jour",
    example: 'Tondeuse à gazon thermique (état neuf)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({
    description: "Description de l'annonce mise à jour",
    example:
      'Prêt gratuit de ma tondeuse thermique, à venir chercher sur place.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Identifiant de la catégorie mise à jour',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @ApiPropertyOptional({
    description: 'Prix proposé en centimes mis à jour (0 pour gratuit)',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  price_cents?: number;

  @ApiPropertyOptional({
    description: 'Identifiant du quartier mis à jour',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  neighbourhood_id?: string;
}

export class UpdateContentDto {
  @ApiPropertyOptional({
    description: "Contenu HTML enrichi de l'annonce (sauvegardé dans MongoDB)",
    example: '<p>Voici les détails supplémentaires...</p>',
  })
  @IsOptional()
  @IsString()
  body_html?: string;

  @ApiPropertyOptional({
    description: "Liste de tags associés à l'annonce",
    example: ['jardinage', 'outil', 'prêt'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class CancelListingDto {
  @ApiProperty({
    description: "Motif de l'annulation de l'annonce",
    example: 'Objet déjà vendu par un autre biais',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ReportListingDto {
  @ApiProperty({
    description: "Motif du signalement de l'annonce",
    example: 'Contenu inapproprié ou spam publicitaire',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ModerateListingDto {
  @ApiProperty({
    description:
      "Action de modération à appliquer ('cancelled', 'warned', 'restored')",
    example: 'cancelled',
  })
  @IsIn(['cancelled', 'warned', 'restored'])
  action: string;

  @ApiProperty({
    description: "Motif officiel de l'action de modération",
    example:
      "Contenu contraire aux conditions générales d'utilisation (vente de produit illégal).",
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class SignDocumentDto {
  @ApiProperty({
    description: "Signature au format Base64 de l'élément canvas",
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  @IsString()
  @IsNotEmpty()
  canvas_b64: string;

  @ApiProperty({
    description: 'Code TOTP pour signature électronique sécurisée',
    example: '123456',
  })
  @IsString()
  @Length(6, 6)
  totp_code: string;
}

export class ReportedListingItemDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: ListingTypeEnum }) listing_type: ListingTypeEnum;
  @ApiProperty() price_cents: number;
  @ApiProperty({ enum: ListingStatusEnum }) status: ListingStatusEnum;
  @ApiProperty({ nullable: true }) neighbourhood_id: string | null;
  @ApiProperty() category_id: string;
  @ApiProperty() creator_id: string;
  @ApiProperty({ type: String, format: 'date-time' }) created_at: Date;
  @ApiProperty({ description: 'Nombre de signalements non résolus' })
  reports_count: number;
  @ApiProperty({ nullable: true, description: 'Motif du dernier signalement non résolu' })
  last_reason: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  last_report_at: Date | null;
}

export class ReportedListingsResponseDto {
  @ApiProperty({ type: [ReportedListingItemDto] }) data: ReportedListingItemDto[];
  @ApiProperty() total: number;
}
