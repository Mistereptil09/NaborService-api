import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IncidentSeverityEnum } from '../../../common/enums';

export class CreateIncidentDto {
  @ApiProperty({ example: 'Éclairage public cassé rue des Lilas' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    example: 'Le lampadaire ne fonctionne plus depuis 3 jours.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'nb-downtown' })
  @IsOptional()
  @IsString()
  neighbourhood_id?: string;

  @ApiPropertyOptional({
    enum: IncidentSeverityEnum,
    default: IncidentSeverityEnum.MEDIUM,
  })
  @IsOptional()
  @IsIn([
    IncidentSeverityEnum.LOW,
    IncidentSeverityEnum.MEDIUM,
    IncidentSeverityEnum.HIGH,
    IncidentSeverityEnum.CRITICAL,
  ])
  severity?: IncidentSeverityEnum;
}
