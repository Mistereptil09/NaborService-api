import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Evenement } from '../entities/evenement.entity';
import { EventStatusEnum, ModerationActionEnum } from '../../../common/enums';

export class ListEventsDto {
  @ApiPropertyOptional({
    description: 'Number of elements to skip for pagination (offset)',
    example: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset: number = 0;

  @ApiPropertyOptional({
    description: 'Maximum number of elements to return per page',
    example: 20,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by neighbourhood ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  neighbourhood?: string;

  @ApiPropertyOptional({ description: 'Filter by category ID', example: 3 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  category?: number;

  @ApiPropertyOptional({
    description: 'Filter by event status',
    example: 'open',
  })
  @IsOptional()
  @IsIn(['draft', 'published', 'open', 'completed', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({
    description:
      'Only return upcoming events (starts_at in the future or unset), ordered soonest first',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  upcoming?: boolean;
}

export class CreateEventDto {
  @ApiProperty({
    description: 'Title of the event',
    example: 'Community Picnic',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiPropertyOptional({
    description: 'Description of the event',
    example: 'A nice picnic in the park.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Associated category ID', example: 1 })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @ApiPropertyOptional({
    description: 'Invitation code (null for public)',
    example: 'SECRET2026',
  })
  @IsOptional()
  @IsString()
  invite_code?: string;

  @ApiPropertyOptional({
    description: 'Cost in cents (0 for free)',
    example: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  cost_cents?: number;

  @ApiPropertyOptional({
    description: 'Points rewarded to each registered participant on completion (0 for none)',
    example: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  reward_points?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of participants',
    example: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_participants?: number;

  @ApiPropertyOptional({
    description: 'Start time of the event',
    example: '2026-06-01T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @ApiPropertyOptional({
    description: 'End time of the event',
    example: '2026-06-01T14:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @ApiPropertyOptional({
    description: 'Neighbourhood ID where the event takes place',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  neighbourhood_id?: string;

  @ApiPropertyOptional({
    description: 'Refund deadline in hours before event',
    example: 48,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  refund_deadline_hours?: number;
}

export class UpdateEventDto {
  @ApiPropertyOptional({
    description: 'Title of the event',
    example: 'Community Picnic',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  title?: string;

  @ApiPropertyOptional({
    description: 'Description of the event',
    example: 'A nice picnic in the park.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Associated category ID', example: 1 })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @ApiPropertyOptional({
    description: 'Invitation code (null for public)',
    example: 'SECRET2026',
  })
  @IsOptional()
  @IsString()
  invite_code?: string;

  @ApiPropertyOptional({
    description: 'Cost in cents (0 for free)',
    example: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  cost_cents?: number;

  @ApiPropertyOptional({
    description: 'Points rewarded to each registered participant on completion (0 for none)',
    example: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  reward_points?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of participants',
    example: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_participants?: number;

  @ApiPropertyOptional({
    description: 'Start time of the event',
    example: '2026-06-01T10:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @ApiPropertyOptional({
    description: 'End time of the event',
    example: '2026-06-01T14:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @ApiPropertyOptional({
    description: 'Neighbourhood ID where the event takes place',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  neighbourhood_id?: string;

  @ApiPropertyOptional({
    description: 'Refund deadline in hours before event',
    example: 48,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  refund_deadline_hours?: number;
}

class ProgrammeItemDto {
  @ApiProperty({ example: '10:00' })
  @IsString()
  time: string;

  @ApiProperty({ example: 'Welcome and Registration' })
  @IsString()
  label: string;
}

class LocationDto {
  @ApiPropertyOptional({ example: '123 Park Lane' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '48.8566,2.3522' })
  @IsOptional()
  @IsString()
  geocode?: string;
}

export class EventUpdateContentDto {
  @ApiPropertyOptional({
    description: 'Rich HTML content of the event',
    example: '<p>Details here...</p>',
  })
  @IsOptional()
  @IsString()
  body_html?: string;

  @ApiPropertyOptional({ type: [ProgrammeItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgrammeItemDto)
  programme?: ProgrammeItemDto[];

  @ApiPropertyOptional({ type: LocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
}

export class EventSwipeDto {
  @ApiProperty({ description: 'Swipe direction', example: 'like' })
  @IsIn(['like', 'dislike'])
  direction: string;
}

export class ReportDto {
  @ApiProperty({
    description: 'Reason for reporting',
    example: 'Inappropriate content',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  reason: string;
}

export class ModerateDto {
  @ApiProperty({ description: 'Moderation action', example: 'cancelled' })
  @IsIn(['cancelled', 'warned', 'restored'])
  action: string;

  @ApiProperty({
    description: 'Reason for moderation',
    example: 'Violates terms of service',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  reason: string;
}

export class CancelDto {
  @ApiProperty({
    description: 'Reason for cancelling the event',
    example: 'Not enough participants',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  reason: string;
}

export class ScanTicketDto {
  @ApiProperty({
    description: 'HMAC signature of the ticket payload',
    example: 'a1b2c3d4...',
  })
  @IsString()
  @IsNotEmpty()
  hmac: string;
}

export class ReportedEventItemDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Entité évènement complète (Evenement)',
  })
  event: Evenement;
  @ApiProperty({ description: 'Nombre de signalements sur cet évènement' })
  reportCount: number;
  @ApiProperty({ type: String, format: 'date-time' })
  lastReportedAt: Date;
}

export class EventsPaginationMetaDto {
  @ApiProperty() total: number;
  @ApiProperty() offset: number;
  @ApiProperty() limit: number;
}

export class ReportedEventsResponseDto {
  @ApiProperty({ type: [ReportedEventItemDto] }) data: ReportedEventItemDto[];
  @ApiProperty({ type: EventsPaginationMetaDto }) meta: EventsPaginationMetaDto;
}

export class EventModerationActionItemDto {
  @ApiProperty() id: string;
  @ApiProperty() eventId: string;
  @ApiProperty() moderatorId: string;
  @ApiProperty({ enum: ModerationActionEnum }) action: ModerationActionEnum;
  @ApiProperty() reason: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
}

export class ListEventModerationActionsResponseDto {
  @ApiProperty({ type: [EventModerationActionItemDto] })
  data: EventModerationActionItemDto[];
  @ApiProperty({ type: EventsPaginationMetaDto }) meta: EventsPaginationMetaDto;
}

export class EventItemDto {
  @ApiProperty() id: string;
  @ApiProperty() creatorId: string;
  @ApiProperty({ nullable: true }) neighbourhoodId: string | null;
  @ApiProperty({ nullable: true }) categoryId: number | null;
  @ApiProperty({ nullable: true }) groupId: string | null;
  @ApiProperty() title: string;
  @ApiProperty({ enum: EventStatusEnum }) status: EventStatusEnum;
  @ApiProperty({ nullable: true }) inviteCode: string | null;
  @ApiProperty() costCents: number;
  @ApiProperty({ description: 'Cost converted to points using the current platform rate' })
  costPoints: number;
  @ApiProperty({ description: 'Points rewarded to each registered participant on completion' })
  rewardPoints: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  startsAt: Date | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  endsAt: Date | null;
  @ApiProperty({ nullable: true }) maxParticipants: number | null;
  @ApiProperty() refundDeadlineHours: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiPropertyOptional({
    description: "Current user's swipe direction for this event",
    enum: ['like', 'dislike', null],
  })
  userSwipe?: 'like' | 'dislike' | null;
  @ApiProperty({
    nullable: true,
    description: "Identifiant du média de couverture (ObjectId, sinon null)",
  })
  coverMediaId: string | null;
}

export class ListEventsResponseDto {
  @ApiProperty({ type: [EventItemDto] }) data: EventItemDto[];
  @ApiProperty({ type: EventsPaginationMetaDto }) meta: EventsPaginationMetaDto;
}
