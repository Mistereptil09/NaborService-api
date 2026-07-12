import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import { CallTypeEnum } from '../../../common/enums';

export class InitiateCallDto {
  @ApiProperty({ example: '019e8ac4-cec5-7bf0-a384-4dfb905a9471' })
  @IsUUID()
  group_id: string;

  @ApiProperty({ enum: CallTypeEnum, example: CallTypeEnum.VIDEO })
  @IsIn([CallTypeEnum.AUDIO, CallTypeEnum.VIDEO])
  type: CallTypeEnum;
}
