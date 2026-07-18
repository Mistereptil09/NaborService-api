import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { ListIncidentsDto } from './dto/list-incidents.dto';
import { AssignIncidentDto } from './dto/assign-incident.dto';
import {
  IncidentResponseDto,
  ListIncidentsResponseDto,
} from './dto/incident-response.dto';

@ApiTags('Incidents')
@Controller('incidents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  // ── List ─────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Lister les incidents (filtrés et paginés)' })
  @ApiOkResponse({
    description: 'Liste paginée des incidents',
    type: ListIncidentsResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async list(
    @Query() filters: ListIncidentsDto,
    @Req() req: any,
  ): Promise<ListIncidentsResponseDto> {
    return this.incidentsService.findAll(req.user.sub, filters);
  }

  // ── Create ───────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Signaler un incident' })
  @ApiCreatedResponse({ description: 'Incident créé avec succès' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async create(@Body() dto: CreateIncidentDto, @Req() req: any) {
    return this.incidentsService.create(req.user.sub, dto);
  }

  // ── Detail ───────────────────────────────────────────────

  @Get(':incident_id')
  @ApiOperation({ summary: "Détail d'un incident" })
  @ApiOkResponse({
    description: "Détail de l'incident",
    type: IncidentResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Incident introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async get(@Param('incident_id') id: string) {
    return this.incidentsService.findOne(id);
  }

  // ── Update ───────────────────────────────────────────────

  @Patch(':incident_id')
  @ApiOperation({
    summary: 'Modifier un incident (signalant, assigné, ou modérateur)',
  })
  @ApiOkResponse({ description: 'Incident mis à jour' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiForbiddenResponse({ description: 'Non autorisé à modifier cet incident' })
  @ApiNotFoundResponse({ description: 'Incident introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async update(
    @Param('incident_id') id: string,
    @Body() dto: UpdateIncidentDto,
    @Req() req: any,
  ) {
    return this.incidentsService.update(id, req.user.sub, dto, req.user.role);
  }

  // ── Assign ───────────────────────────────────────────────

  @Post(':incident_id/assign')
  @Roles('moderator', 'admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Assigner un incident (modérateur/admin)' })
  @ApiOkResponse({ description: 'Incident assigné' })
  @ApiForbiddenResponse({
    description: 'Action réservée aux modérateurs et administrateurs',
  })
  @ApiNotFoundResponse({ description: 'Incident ou assigné introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async assign(
    @Param('incident_id') id: string,
    @Body() dto: AssignIncidentDto,
    @Req() req: any,
  ) {
    return this.incidentsService.assign(id, req.user.sub, dto.assignee_id);
  }

  // ── Resolve ──────────────────────────────────────────────

  @Post(':incident_id/resolve')
  @Roles('moderator', 'admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Résoudre un incident (modérateur/admin)' })
  @ApiOkResponse({ description: 'Incident résolu' })
  @ApiForbiddenResponse({
    description: 'Action réservée aux modérateurs et administrateurs',
  })
  @ApiNotFoundResponse({ description: 'Incident introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async resolve(@Param('incident_id') id: string) {
    return this.incidentsService.resolve(id);
  }

  // ── Delete ───────────────────────────────────────────────

  @Delete(':incident_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer un incident (signalant ou modérateur/admin)',
  })
  @ApiOkResponse({ description: 'Incident supprimé' })
  @ApiForbiddenResponse({
    description: 'Non autorisé à supprimer cet incident',
  })
  @ApiNotFoundResponse({ description: 'Incident introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async delete(@Param('incident_id') id: string, @Req() req: any) {
    await this.incidentsService.delete(id, req.user.sub, req.user.role);
    return { success: true };
  }
}
