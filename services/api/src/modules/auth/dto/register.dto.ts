import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'stainvy@test.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255, { message: 'email must be at most 255 characters' })
  email: string;

  @ApiProperty({ example: 'Stainvy' })
  @IsString()
  @IsNotEmpty({ message: 'firstName must not be empty' })
  @MaxLength(100, { message: 'firstName must be at most 100 characters' })
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @IsNotEmpty({ message: 'lastName must not be empty' })
  @MaxLength(100, { message: 'lastName must be at most 100 characters' })
  lastName: string;

  @ApiProperty({ example: 'Stainvy123!' })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(128, { message: 'password must be at most 128 characters' })
  password: string;
}
