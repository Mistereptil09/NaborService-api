import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({ enum: PollTypeEnum, default: PollTypeEnum.SINGLE })
  @IsOptional()
  @IsIn([PollTypeEnum.SINGLE, PollTypeEnum.MULTIPLE, PollTypeEnum.WEIGHTED])
  poll_type?: PollTypeEnum;

  @ApiPropertyOptional({ example: 'nb-downtown' })
  @IsOptional()
  @IsString()
  neighbourhood_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;
}
