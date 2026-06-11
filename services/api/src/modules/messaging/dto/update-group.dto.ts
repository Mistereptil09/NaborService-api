import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGroupDto {
  @ApiPropertyOptional({ example: 'Nouveau nom du groupe' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Nouvelle description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
