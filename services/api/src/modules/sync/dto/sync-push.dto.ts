import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class SyncUpdateItemDto {
  @ApiProperty({ enum: ['user', 'listing', 'event', 'incident'] })
  @IsIn(['user', 'listing', 'event', 'incident'])
  entity_type: 'user' | 'listing' | 'event' | 'incident';

  @ApiProperty()
  @IsString()
  entity_id: string;

  @ApiPropertyOptional({
    enum: ['create', 'update', 'delete'],
    default: 'update',
    description:
      'Action à exécuter. `create` et `delete` sont uniquement supportés ' +
      'pour `entity_type: "incident"`. Défaut `update` (rétrocompatible).',
  })
  @IsOptional()
  @IsIn(['create', 'update', 'delete'])
  action?: 'create' | 'update' | 'delete' = 'update';

  @ApiProperty({
    description:
      'Champs modifiés (update) ou données de la nouvelle entité (create). Ignoré pour delete.',
  })
  @IsObject()
  changes: Record<string, any>;

  @ApiPropertyOptional({
    description:
      "L'`updated_at` de l'entité tel que reçu dans le dernier snapshot serveur. " +
      'Obligatoire pour update/delete (détection de conflit). Inutile pour create.',
  })
  @IsOptional()
  @IsDateString()
  base_updated_at?: string;
}

export class SyncUpdatesBatchDto {
  @ApiProperty()
  @IsUUID()
  jobId: string;

  @ApiProperty({ type: [SyncUpdateItemDto] })
  @IsArray()
  @ArrayMaxSize(100, { message: 'Max 100 updates per batch request' })
  @ValidateNested({ each: true })
  @Type(() => SyncUpdateItemDto)
  updates: SyncUpdateItemDto[];
}

export class SyncUpdateResultDto {
  @ApiProperty()
  entity_type: string;

  @ApiProperty()
  entity_id: string;

  @ApiProperty({ enum: ['applied', 'conflict', 'skipped'] })
  status: 'applied' | 'conflict' | 'skipped';

  @ApiPropertyOptional({
    description:
      "ID serveur assigné lors d'une création. Le client doit remplacer " +
      'son UUID temporaire par cet ID dans sa base SQLite locale.',
  })
  @IsOptional()
  @IsString()
  server_entity_id?: string;

  @ApiPropertyOptional({
    description:
      'Raison du skip (champ requis manquant, action non supportée, etc.)',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Conflict details (only when status = conflict)',
  })
  @IsOptional()
  @IsObject()
  conflict?: {
    field_name: string | null;
    client_data: any;
    server_data: any;
  };
}

export class SyncUpdatesResponseDto {
  @ApiProperty({
    description: 'True when all updates were applied without conflicts',
  })
  @IsBoolean()
  success: boolean;

  @ApiProperty({
    description: 'True when at least one conflict was detected and logged',
  })
  @IsBoolean()
  has_conflicts: boolean;

  @ApiProperty({ description: 'Number of updates successfully applied' })
  applied_count: number;

  @ApiProperty({
    description: 'Number of conflicts detected and logged for audit',
  })
  conflict_count: number;

  @ApiProperty({
    type: [SyncUpdateResultDto],
    description: 'Per-entity result details',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncUpdateResultDto)
  results: SyncUpdateResultDto[];
}
