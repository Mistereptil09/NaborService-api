import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PointsLedgerEntryTypeEnum } from '../../../common/enums';

export class CreateTopupDto {
  @ApiPropertyOptional({
    description: 'Montant en centimes à convertir en points (minimum 100 = 1€)',
    example: 1000,
  })
  @IsInt()
  @Min(100)
  amountCents: number;
}

export class ListLedgerDto {
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

  @ApiPropertyOptional({
    description: "Filtrer par type d'opération",
    enum: PointsLedgerEntryTypeEnum,
  })
  @IsOptional()
  @IsEnum(PointsLedgerEntryTypeEnum)
  type?: PointsLedgerEntryTypeEnum;
}
