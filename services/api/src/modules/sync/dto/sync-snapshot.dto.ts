import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetSnapshotQueryDto {
  @ApiProperty({
    description:
      'Timestamp ISO de la dernière synchronisation (moins 30 secondes pour overlap)',
    example: '2023-10-01T12:00:00Z',
  })
  @IsDate()
  @Transform(({ value }) => new Date(value))
  since: Date;

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
      'Curseur pour la pagination (si has_more = true dans la page précédente)',
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

  @ApiPropertyOptional({
    description: 'Curseur pour récupérer la page suivante',
  })
  cursor?: string;

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
}
