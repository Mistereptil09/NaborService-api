import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, IsOptional } from 'class-validator';

export class UpdateCaptionDto {
  @ApiProperty({
    description:
      "Nouvelle légende pour la photo de l'annonce (maximum 280 caractères, peut être explicitement définie à null pour la supprimer)",
    type: String,
    nullable: true,
    example: 'Spacieux salon baigné de lumière naturelle, orienté plein sud',
  })
  @IsString()
  @MaxLength(280)
  @IsOptional()
  caption: string | null;
}
