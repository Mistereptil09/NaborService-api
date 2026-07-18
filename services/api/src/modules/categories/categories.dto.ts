import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiPropertyOptional({ example: 'Jardinage' })
  @IsString()
  @MinLength(1)
  category_name!: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'ID de la catégorie parente (null = racine)',
  })
  @IsInt()
  @IsOptional()
  parent_category?: number | null;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Bricolage' })
  @IsString()
  @MinLength(1)
  @IsOptional()
  category_name?: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'ID de la catégorie parente',
  })
  @IsInt()
  @IsOptional()
  parent_category?: number | null;
}
