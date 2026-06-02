import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'uuid-token-string',
    description: 'Le token de réinitialisation reçu par email',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le token est requis' })
  token: string;

  @ApiProperty({
    example: 'NouveauMotDePasse123!',
    description: 'Le nouveau mot de passe',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  @MinLength(12, {
    message: 'Le mot de passe doit contenir au moins 12 caractères',
  })
  password: string;
}
