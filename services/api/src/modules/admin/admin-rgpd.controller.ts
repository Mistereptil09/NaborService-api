import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRgpdService } from './admin-rgpd.service';

@ApiTags('Admin')
@Controller('admin/rgpd')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminRgpdController {
  constructor(private readonly rgpdService: AdminRgpdService) {}

  @Get('requests')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les demandes RGPD (Admin)' })
  @ApiOkResponse({ description: 'Demandes RGPD retournées' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  async getRequests() {
    return this.rgpdService.getRgpdRequests();
  }

  @Post('requests/:user_id/anonymize')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anonymiser manuellement un utilisateur supprimé (Admin)' })
  @ApiOkResponse({ description: 'Processus d\'anonymisation lancé' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async anonymize(@Param('user_id') userId: string) {
    return this.rgpdService.anonymizeUserManually(userId);
  }

  @Get('requests/:user_id/status')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consulter le statut d\'une demande RGPD d\'un utilisateur (Admin)' })
  @ApiOkResponse({ description: 'Statut de la demande retourné' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiNotFoundResponse({ description: 'Utilisateur introuvable' })
  async getStatus(@Param('user_id') userId: string) {
    return this.rgpdService.getRgpdRequestStatus(userId);
  }
}
