import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminEditMessageDto {
  @ApiProperty({ example: 'Contenu corrigé par la modération.' })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  content: string;
}
