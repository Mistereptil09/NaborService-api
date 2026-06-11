import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AddOptionDto {
  @ApiProperty({ example: 'Vert forêt' })
  @IsString()
  @MaxLength(100)
  label: string;
}
