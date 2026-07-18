import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class MuteDto {
  @ApiPropertyOptional({
    example: 60,
    description: 'Durée en minutes. Omettez pour un mute permanent.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration_minutes?: number;
}
