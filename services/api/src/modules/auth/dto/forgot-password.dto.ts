import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: "L'adresse email du compte à réinitialiser",
  })
  @IsEmail({}, { message: "L'email n'est pas valide" })
  @IsNotEmpty({ message: "L'email est requis" })
  email: string;
}
