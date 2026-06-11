import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignIncidentDto {
  @ApiPropertyOptional({
    description: "ID de l'utilisateur assigné. Si absent, le modérateur s'auto-assigne.",
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  assignee_id?: string;
}
