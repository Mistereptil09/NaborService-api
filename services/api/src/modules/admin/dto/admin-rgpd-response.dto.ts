import { ApiProperty } from '@nestjs/swagger';

export class RgpdRequestDto {
  @ApiProperty() userId: string;
  @ApiProperty() email: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty({ type: String, format: 'date-time' }) deletedAt: Date;
  @ApiProperty({ enum: ['pending', 'completed'] })
  status: 'pending' | 'completed';
}

export class RgpdRequestStatusDto {
  @ApiProperty({ enum: ['none', 'pending', 'completed'] })
  status: 'none' | 'pending' | 'completed';
}
