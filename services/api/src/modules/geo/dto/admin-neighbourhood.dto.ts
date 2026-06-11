import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateNeighbourhoodDto {
  @ApiProperty({ example: 'nb-downtown' })
  @IsString()
  @IsNotEmpty()
  pg_id: string;

  @ApiProperty({ example: 'Downtown Paris' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Paris' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: '75001' })
  @IsString()
  @IsNotEmpty()
  zip_code: string;

  @ApiProperty({ example: 'FR' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ description: 'GeoJSON Polygon' })
  @IsObject()
  geometry: GeoJSON.Polygon;
}

export class UpdateNeighbourhoodDto {
  @ApiPropertyOptional({ example: 'Downtown Paris' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'Paris' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @ApiPropertyOptional({ example: '75001' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  zip_code?: string;

  @ApiPropertyOptional({ example: 'FR' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  country?: string;

  @ApiPropertyOptional({ description: 'GeoJSON Polygon — if provided, centroid and adjacencies are recomputed' })
  @IsOptional()
  @IsObject()
  geometry?: GeoJSON.Polygon;
}

export class OverlapCheckDto {
  @ApiProperty({ description: 'Candidat GeoJSON Polygon à vérifier' })
  @IsObject()
  geometry: GeoJSON.Polygon;
}
