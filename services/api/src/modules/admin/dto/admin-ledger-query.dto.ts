import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PointsLedgerEntryTypeEnum } from '../../../common/enums';

export class AdminListLedgerDto {
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

  @ApiPropertyOptional({ description: 'Filtrer par utilisateur' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: "Filtrer par type d'opération",
    enum: PointsLedgerEntryTypeEnum,
  })
  @IsOptional()
  @IsEnum(PointsLedgerEntryTypeEnum)
  type?: PointsLedgerEntryTypeEnum;

  @ApiPropertyOptional({ description: 'Date de début (incluse)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Date de fin (incluse)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
