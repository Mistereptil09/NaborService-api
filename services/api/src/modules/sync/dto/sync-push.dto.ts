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

  @ApiProperty()
  @IsObject()
  changes: Record<string, any>;

  @ApiProperty({
    description:
      "The entity's `updated_at` value from the last server snapshot — NOT the client's local clock. Used for conflict detection: if server.updated_at > base_updated_at, the entity was modified on the server since the client last synced.",
  })
  @IsDateString()
  base_updated_at: string;
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

// ---- Response DTOs ----

export class SyncUpdateResultDto {
  @ApiProperty()
  entity_type: string;

  @ApiProperty()
  entity_id: string;

  @ApiProperty({ enum: ['applied', 'conflict', 'skipped'] })
  status: 'applied' | 'conflict' | 'skipped';

  @ApiPropertyOptional({ description: 'Conflict details (only when status = conflict)' })
  @IsOptional()
  @IsObject()
  conflict?: {
    field_name: string | null;
    client_data: any;
    server_data: any;
  };
}

export class SyncUpdatesResponseDto {
  @ApiProperty({ description: 'True when all updates were applied without conflicts' })
  @IsBoolean()
  success: boolean;

  @ApiProperty({ description: 'True when at least one conflict was detected and logged' })
  @IsBoolean()
  has_conflicts: boolean;

  @ApiProperty({ description: 'Number of updates successfully applied' })
  applied_count: number;

  @ApiProperty({ description: 'Number of conflicts detected and logged for audit' })
  conflict_count: number;

  @ApiProperty({ type: [SyncUpdateResultDto], description: 'Per-entity result details' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncUpdateResultDto)
  results: SyncUpdateResultDto[];
}
