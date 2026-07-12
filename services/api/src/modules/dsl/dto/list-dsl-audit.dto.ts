import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListDslAuditDto {
  @ApiPropertyOptional({
    description: "Nombre d'éléments à sauter pour la pagination (offset)",
    example: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({
    description: "Nombre maximum d'éléments à retourner par page",
    example: 50,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

export class DslAuditItemDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() userRole: string;
  @ApiProperty() query: string;
  @ApiProperty() collection: string;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  filter: Record<string, unknown> | null;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  order: Record<string, unknown> | null;
  @ApiProperty() limit: number;
  @ApiProperty({ nullable: true }) resultCount: number | null;
  @ApiProperty() hasError: boolean;
  @ApiProperty({ nullable: true }) errorMessage: string | null;
  @ApiProperty({ nullable: true }) ipAddress: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class DslAuditPaginationMetaDto {
  @ApiProperty() total: number;
  @ApiProperty() offset: number;
  @ApiProperty() limit: number;
}

export class ListDslAuditResponseDto {
  @ApiProperty({ type: [DslAuditItemDto] }) data: DslAuditItemDto[];
  @ApiProperty({ type: DslAuditPaginationMetaDto }) meta: DslAuditPaginationMetaDto;
}
