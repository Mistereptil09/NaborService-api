import { ApiProperty } from '@nestjs/swagger';

export class AdminOverviewStatsDto {
  @ApiProperty() totalUsers: number;
  @ApiProperty() totalListings: number;
  @ApiProperty() totalEvents: number;
  @ApiProperty() activeIncidents: number;
  @ApiProperty() totalPaymentsPoints: number;
}

export class ListingTypeBreakdownItemDto {
  @ApiProperty() type: string;
  @ApiProperty() count: number;
}

export class ListingStatusBreakdownItemDto {
  @ApiProperty() status: string;
  @ApiProperty() count: number;
}

export class CategoryBreakdownItemDto {
  @ApiProperty() categoryName: string;
  @ApiProperty() count: number;
}

export class AdminListingsStatsDto {
  @ApiProperty({ type: [ListingTypeBreakdownItemDto] })
  typeBreakdown: ListingTypeBreakdownItemDto[];
  @ApiProperty({ type: [ListingStatusBreakdownItemDto] })
  statusBreakdown: ListingStatusBreakdownItemDto[];
  @ApiProperty({ type: [CategoryBreakdownItemDto] })
  categoryBreakdown: CategoryBreakdownItemDto[];
}

export class EventStatusBreakdownItemDto {
  @ApiProperty() status: string;
  @ApiProperty() count: number;
}

export class ParticipantStatusBreakdownItemDto {
  @ApiProperty() status: string;
  @ApiProperty() count: number;
}

export class AdminEventsStatsDto {
  @ApiProperty({ type: [EventStatusBreakdownItemDto] })
  statusBreakdown: EventStatusBreakdownItemDto[];
  @ApiProperty({ type: [CategoryBreakdownItemDto] })
  categoryBreakdown: CategoryBreakdownItemDto[];
  @ApiProperty({ type: [ParticipantStatusBreakdownItemDto] })
  participantBreakdown: ParticipantStatusBreakdownItemDto[];
}

export class TransactionStatusBreakdownItemDto {
  @ApiProperty() status: string;
  @ApiProperty() count: number;
}

export class AdminPaymentsStatsDto {
  @ApiProperty() totalAmountPoints: number;
  @ApiProperty() totalCommissionPoints: number;
  @ApiProperty({ type: [TransactionStatusBreakdownItemDto] })
  statusBreakdown: TransactionStatusBreakdownItemDto[];
}

export class UserRoleBreakdownItemDto {
  @ApiProperty() role: string;
  @ApiProperty() count: number;
}

export class NeighbourhoodBreakdownItemDto {
  @ApiProperty() neighbourhoodId: string;
  @ApiProperty() count: number;
}

export class AdminUsersStatsDto {
  @ApiProperty({ type: [UserRoleBreakdownItemDto] })
  roleBreakdown: UserRoleBreakdownItemDto[];
  @ApiProperty() suspendedCount: number;
  @ApiProperty({ type: [NeighbourhoodBreakdownItemDto] })
  neighbourhoodBreakdown: NeighbourhoodBreakdownItemDto[];
}

export class IncidentStatusBreakdownItemDto {
  @ApiProperty() status: string;
  @ApiProperty() count: number;
}

export class IncidentSeverityBreakdownItemDto {
  @ApiProperty() severity: string;
  @ApiProperty() count: number;
}

export class AdminIncidentsStatsDto {
  @ApiProperty({ type: [IncidentStatusBreakdownItemDto] })
  statusBreakdown: IncidentStatusBreakdownItemDto[];
  @ApiProperty({ type: [IncidentSeverityBreakdownItemDto] })
  severityBreakdown: IncidentSeverityBreakdownItemDto[];
}
