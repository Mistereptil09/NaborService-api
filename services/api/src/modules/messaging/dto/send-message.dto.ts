import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Salut tout le monde !' })
  @IsString()
  @MaxLength(10000)
  content: string;

  @ApiProperty({ enum: ['text', 'image', 'file', 'voice'], default: 'text' })
  @IsIn(['text', 'image', 'file', 'voice'])
  type: 'text' | 'image' | 'file' | 'voice';
}
