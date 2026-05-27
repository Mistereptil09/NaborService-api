import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class ReorderPhotosDto {
  @ApiProperty({
    description: "Liste ordonnée des media_ids (identifiants MongoDB de 24 caractères hexadécimaux) de l'annonce représentant leur nouvel agencement contigu",
    type: [String],
    example: ['60d5ec49f321481b4c8b4567', '60d5ec49f321481b4c8b4568', '60d5ec49f321481b4c8b4569'],
  })
  @IsArray()
  @IsString({ each: true })
  mediaIds: string[];
}
