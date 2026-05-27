import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class TotpConfirmDto {
  @ApiProperty({
    description: "Code TOTP à 6 chiffres de l'application d'authentification",
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code: string;
}
