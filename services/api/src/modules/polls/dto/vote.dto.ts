import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class VoteDto {
  @ApiProperty({ example: '019e8ac4-d6f1-7ac4-a987-87e4db964f73' })
  @IsUUID()
  option_id: string;
}
