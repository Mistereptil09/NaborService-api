import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'stainvy@test.com' })
  email: string;

  @ApiProperty({ example: 'Stainvy' })
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  lastName: string;

  @ApiProperty({ example: 'Stainvy123!' })
  password: string;
}
