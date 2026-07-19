import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdminAdjustPointsDto {
  @ApiProperty({
    description: "Identifiant de l'utilisateur concerné",
    example: '019f7b25-bd4a-7c04-882f-5a0eddf5a7eb',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Montant signé en points (positif = crédit, négatif = débit)',
    example: 250,
  })
  @IsInt()
  amountPoints: number;

  @ApiPropertyOptional({
    description: "Motif de l'intervention admin",
    example: 'Correction suite à un bug de pointage',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description?: string;
}
