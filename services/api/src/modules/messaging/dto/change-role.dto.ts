import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { GroupRoleEnum } from '../../../common/enums';

export class ChangeRoleDto {
  @ApiProperty({ enum: GroupRoleEnum })
  @IsIn([
    GroupRoleEnum.WATCH,
    GroupRoleEnum.MESSAGE,
    GroupRoleEnum.ACTIONS,
    GroupRoleEnum.ADMIN,
  ])
  role: GroupRoleEnum;
}
