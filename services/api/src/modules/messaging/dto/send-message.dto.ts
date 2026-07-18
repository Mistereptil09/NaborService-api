import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Salut tout le monde !' })
  @IsString()
  @MaxLength(10000)
  content: string;

  @ApiProperty({
    enum: ['text', 'image', 'file', 'voice', 'poll'],
    default: 'text',
  })
  @IsIn(['text', 'image', 'file', 'voice', 'poll'])
  type: 'text' | 'image' | 'file' | 'voice' | 'poll';

  @ApiPropertyOptional({ description: 'Id du message auquel on répond' })
  @IsOptional()
  @IsUUID()
  parent_message_id?: string;

  @ApiPropertyOptional({
    description: 'Id du sondage affiché (type "poll" uniquement)',
  })
  @IsOptional()
  @IsUUID()
  poll_id?: string;
}
