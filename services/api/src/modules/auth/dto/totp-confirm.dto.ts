import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class TotpConfirmDto {
  @ApiProperty({
    description: 'TOTP 6-digit code from authenticator app',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string;
}
