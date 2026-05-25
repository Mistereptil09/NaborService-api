import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'stainvy@test.com' })
  email: string;

  @ApiProperty({ example: 'Stainvy123!' })
  password: string;
}
