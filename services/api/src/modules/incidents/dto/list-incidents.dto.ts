import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  IncidentSeverityEnum,
  IncidentStatusEnum,
} from '../../../common/enums';

export class ListIncidentsDto {
  @ApiPropertyOptional({ example: 'nb-downtown' })
  @IsOptional()
  @IsString()
  neighbourhood_id?: string;

  @ApiPropertyOptional({ enum: IncidentStatusEnum })
  @IsOptional()
  @IsIn([IncidentStatusEnum.OPEN, IncidentStatusEnum.IN_PROGRESS, IncidentStatusEnum.RESOLVED])
  status?: IncidentStatusEnum;

  @ApiPropertyOptional({ enum: IncidentSeverityEnum })
  @IsOptional()
  @IsIn([IncidentSeverityEnum.LOW, IncidentSeverityEnum.MEDIUM, IncidentSeverityEnum.HIGH, IncidentSeverityEnum.CRITICAL])
  severity?: IncidentSeverityEnum;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
