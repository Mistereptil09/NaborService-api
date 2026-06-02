import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsObject, IsString, IsUUID, ValidateNested } from 'class-validator';

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

  @ApiProperty()
  @IsDateString()
  updated_at: string;
}

export class SyncUpdatesBatchDto {
  @ApiProperty()
  @IsUUID()
  jobId: string;

  @ApiProperty({ type: [SyncUpdateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncUpdateItemDto)
  updates: SyncUpdateItemDto[];
}
