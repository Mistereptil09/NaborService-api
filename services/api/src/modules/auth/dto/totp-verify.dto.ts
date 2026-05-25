import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

export class TotpVerifyDto {
  @ApiProperty({
    description: 'Challenge token received from login response',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'challenge_token must be a valid UUID v4' })
  challenge_token: string;

  @ApiProperty({
    description: 'TOTP 6-digit code from authenticator app',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string;
}
