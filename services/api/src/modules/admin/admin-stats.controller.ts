import {
  Controller,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminStatsService } from './admin-stats.service';

@ApiTags('Admin')
@Controller('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  @Get('overview')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consulter les statistiques globales (Admin)' })
  @ApiOkResponse({ description: 'Statistiques globales' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  async getOverview() {
    return this.statsService.getOverview();
  }

  @Get('listings')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statistiques sur les annonces (Admin)' })
  @ApiOkResponse({ description: 'Statistiques annonces' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  async getListingsStats() {
    return this.statsService.getListingsStats();
  }

  @Get('events')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statistiques sur les événements (Admin)' })
  @ApiOkResponse({ description: 'Statistiques événements' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  async getEventsStats() {
    return this.statsService.getEventsStats();
  }

  @Get('payments')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statistiques sur les paiements (Admin)' })
  @ApiOkResponse({ description: 'Statistiques paiements' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  async getPaymentsStats() {
    return this.statsService.getPaymentsStats();
  }

  @Get('users')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statistiques sur les utilisateurs (Admin)' })
  @ApiOkResponse({ description: 'Statistiques utilisateurs' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  async getUsersStats() {
    return this.statsService.getUsersStats();
  }

  @Get('incidents')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statistiques sur les incidents (Admin)' })
  @ApiOkResponse({ description: 'Statistiques incidents' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  async getIncidentsStats() {
    return this.statsService.getIncidentsStats();
  }
}
