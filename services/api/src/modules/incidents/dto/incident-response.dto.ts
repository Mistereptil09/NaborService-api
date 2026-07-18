import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IncidentSeverityEnum,
  IncidentStatusEnum,
} from '../../../common/enums';

export class IncidentResponseDto {
  @ApiProperty({ example: '019e8ac4-cec5-7bf0-a384-4dfb905a9471' })
  id: string;

  @ApiProperty({ example: '019e8ac4-cec5-7bf0-a384-4dfb905a9472' })
  reporterId: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  assignedTo: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'nb-downtown' })
  neighbourhoodId: string | null;

  @ApiProperty({ example: 'Nid de poule béant' })
  title: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Trou énorme chaussée principale.',
  })
  description: string | null;

  @ApiProperty({
    enum: IncidentSeverityEnum,
    example: IncidentSeverityEnum.HIGH,
  })
  severity: IncidentSeverityEnum;

  @ApiProperty({ enum: IncidentStatusEnum, example: IncidentStatusEnum.OPEN })
  status: IncidentStatusEnum;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  assignedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  updatedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  resolvedAt: Date | null;
}

export class IncidentsPaginationMetaDto {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 0 })
  offset: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

export class ListIncidentsResponseDto {
  @ApiProperty({ type: [IncidentResponseDto] })
  data: IncidentResponseDto[];

  @ApiProperty({ type: IncidentsPaginationMetaDto })
  meta: IncidentsPaginationMetaDto;
}
