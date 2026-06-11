import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class EditMessageDto {
  @ApiProperty({ example: 'Message modifié' })
  @IsString()
  @MaxLength(10000)
  new_content: string;
}
