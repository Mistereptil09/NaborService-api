import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PollTypeEnum } from '../../../common/enums';

export class CreatePollDto {
  @ApiProperty({ example: 'Choix de la couleur des bancs publics' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: PollTypeEnum,
    default: PollTypeEnum.SINGLE,
    description: 'Mode de sélection uniquement — la pondération est indépendante, voir is_weighted.',
  })
  @IsOptional()
  @IsIn([PollTypeEnum.SINGLE, PollTypeEnum.MULTIPLE])
  poll_type?: PollTypeEnum;

  @ApiPropertyOptional({ example: 'nb-downtown' })
  @IsOptional()
  @IsString()
  neighbourhood_id?: string;

  @ApiPropertyOptional({
    description: 'Sondage rattaché à une conversation de groupe (prioritaire sur neighbourhood_id si les deux sont fournis).',
  })
  @IsOptional()
  @IsUUID()
  group_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Chaque option votée compte pour son propre poids (voir AddOptionDto.weight) — combinable avec poll_type "multiple".',
  })
  @IsOptional()
  @IsBoolean()
  is_weighted?: boolean;
}
