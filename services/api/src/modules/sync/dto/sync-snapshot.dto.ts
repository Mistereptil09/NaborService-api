import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetSnapshotQueryDto {
  @ApiPropertyOptional({
    description:
      'Timestamp ISO de la dernière synchronisation (moins 30 secondes pour overlap). ' +
      'Requis au premier appel (sans curseur). Ignoré si `cursor` est fourni.',
    example: '2023-10-01T12:00:00Z',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  since?: Date;

  @ApiPropertyOptional({
    description: "Nombre maximal d'entités à retourner",
    default: 500,
    maximum: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 500;

  @ApiPropertyOptional({
    description:
      'Curseur composite pour la pagination. Format : base64(ISO_TIMESTAMP + "|" + entityType + "|" + entityId). ' +
      'Le curseur encode la position exacte (timestamp, type d\'entité, ID) de la dernière entité incluse dans la page précédente. ' +
      'Le serveur utilise un WHERE composite — (timeCol = cursorDate AND id > cursorId) OR (timeCol > cursorDate) — ' +
      'pour le type d\'entité du curseur, évitant toute perte de données même lorsque plusieurs entités partagent le même timestamp.',
    example: 'MjAyNi0wNi0wOVQxNTozMDowMC4wMDBafGluY2lkZW50fDAxOTU3Y2E2LWUyOWItN2Q0MS1hNzE2LTQ0NjY1NTQ0MDAwMA==',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class SnapshotResponseDto {
  @ApiProperty({
    description: 'Nouveau timestamp serveur à stocker comme last_sync_at',
  })
  sync_at: Date;

  @ApiProperty({ description: "Indique s'il reste des entités à synchroniser" })
  has_more: boolean;

  @ApiProperty({
    description:
      'Curseur composite encodant la position de la dernière entité incluse dans cette page ' +
      '(ou sync_at si le delta est vide). Toujours présent — le client le stocke comme point ' +
      'de reprise inconditionnel, sans avoir à brancher sur has_more.',
    example: 'MjAyNi0wNi0wOVQxNTozMDowMC4wMDBafGluY2lkZW50fDAxOTU3Y2E2LWUyOWItN2Q0MS1hNzE2LTQ0NjY1NTQ0MDAwMA==',
  })
  cursor: string;

  @ApiPropertyOptional()
  incidents?: any[];

  @ApiPropertyOptional()
  listing_moderation_actions?: any[];

  @ApiPropertyOptional()
  event_moderation_actions?: any[];

  @ApiPropertyOptional()
  listing_reports?: any[];

  @ApiPropertyOptional()
  event_reports?: any[];

  @ApiPropertyOptional()
  users_raw?: any[];

  @ApiPropertyOptional()
  listings?: any[];

  @ApiPropertyOptional()
  events?: any[];

  @ApiPropertyOptional()
  chat_groups?: any[];

  @ApiPropertyOptional()
  votes?: any[];

  @ApiPropertyOptional()
  polls?: any[];

  @ApiPropertyOptional()
  listing_transactions?: any[];

  @ApiPropertyOptional()
  listing_categories?: any[];

  @ApiPropertyOptional()
  event_categories?: any[];

  @ApiPropertyOptional()
  poll_options?: any[];

  @ApiPropertyOptional()
  event_participants?: any[];

  @ApiPropertyOptional()
  users_in_group?: any[];

  @ApiPropertyOptional()
  follows?: any[];

  @ApiPropertyOptional()
  friendships?: any[];

  @ApiPropertyOptional({
    description: 'Map of neighbourhood pg_id → name for UX display on Java client',
    example: { 'nb-downtown': 'Downtown Paris', 'nb-marais': 'Marais District' },
  })
  neighbourhoods?: Record<string, string>;
}
