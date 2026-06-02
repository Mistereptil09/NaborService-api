import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class GeoAutocompleteQueryDto {
  @ApiProperty({
    description: 'Texte de recherche BAN (adresse partielle ou complète)',
    example: '10 rue de la Paix Paris',
  })
  @IsString()
  @IsNotEmpty()
  q!: string;

  @ApiPropertyOptional({
    description: 'Nombre maximal de résultats BAN',
    example: 5,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
}

export class GeoResolveQueryDto {
  @ApiProperty({
    description: 'Texte de recherche BAN (adresse partielle ou complète)',
    example: '10 rue de la Paix Paris',
  })
  @IsString()
  @IsNotEmpty()
  q!: string;
}
