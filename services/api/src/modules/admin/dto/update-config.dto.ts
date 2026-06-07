import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateConfigDto {
  @ApiPropertyOptional({
    description: 'Commission prélevée par la plateforme (en pourcentage)',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  commissionPercent?: number;

  @ApiPropertyOptional({
    description: "Délai limite pour l'annulation et le remboursement d'un événement (en heures)",
    example: 48,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  refundDeadlineHours?: number;

  @ApiPropertyOptional({
    description: "Délai d'expiration d'un contrat de service non signé (en heures)",
    example: 24,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  contractExpirationHours?: number;

  @ApiPropertyOptional({
    description: 'Délai de confirmation pour la promotion depuis la liste d\'attente (en heures)',
    example: 24,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  waitlistConfirmHours?: number;
}
