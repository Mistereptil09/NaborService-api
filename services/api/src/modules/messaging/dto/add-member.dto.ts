import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({ example: '019e8ac4-cec5-7bf0-a384-4dfb905a9471' })
  @IsUUID()
  user_id: string;
}
