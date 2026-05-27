import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: "Adresse email de l'utilisateur", example: 'stainvy@test.com' })
  email: string;

  @ApiProperty({ description: "Mot de passe de l'utilisateur", example: 'Stainvy123!' })
  password: string;
}
