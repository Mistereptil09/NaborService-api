import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IncidentSeverityEnum } from '../../../common/enums';

export class UpdateIncidentDto {
  @ApiPropertyOptional({
    example: 'Éclairage public cassé rue des Lilas (mis à jour)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    example: 'Situation aggravée, plusieurs lampadaires touchés.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: IncidentSeverityEnum })
  @IsOptional()
  @IsIn([
    IncidentSeverityEnum.LOW,
    IncidentSeverityEnum.MEDIUM,
    IncidentSeverityEnum.HIGH,
    IncidentSeverityEnum.CRITICAL,
  ])
  severity?: IncidentSeverityEnum;
}
