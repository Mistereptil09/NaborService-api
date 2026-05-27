import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: "Prénom de l'utilisateur", example: 'Stainvy' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: "Adresse email de l'utilisateur", example: 'stainvy@test.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
