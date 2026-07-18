import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class AddOptionDto {
  @ApiProperty({ example: 'Vert forêt' })
  @IsString()
  @MaxLength(100)
  label: string;

  @ApiPropertyOptional({
    default: 1,
    description:
      'Poids de cette option pour un sondage "weighted" — par pas de 0.5 (0.5, 1, 1.5, 2…).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  weight?: number;
}
