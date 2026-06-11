import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class VoteDto {
  @ApiProperty({ example: '019e8ac4-d6f1-7ac4-a987-87e4db964f73' })
  @IsUUID('4')
  option_id: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  weight?: number;
}
