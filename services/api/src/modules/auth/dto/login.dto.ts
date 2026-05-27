import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: "Adresse email de l'utilisateur", example: 'stainvy@test.com' })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiProperty({ description: "Mot de passe de l'utilisateur", example: 'Stainvy123!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
