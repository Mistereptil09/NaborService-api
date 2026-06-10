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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Neo4jGeoService } from './neo4j-geo.service';
import { GeoReconciliationService } from './geo-reconciliation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateNeighbourhoodDto,
  UpdateNeighbourhoodDto,
  OverlapCheckDto,
} from './dto/admin-neighbourhood.dto';

@ApiTags('Admin / Neighbourhoods')
@Controller('admin/neighbourhoods')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class NeighbourhoodAdminController {
  constructor(
    private readonly neo4jGeoService: Neo4jGeoService,
    private readonly geoReconciliationService: GeoReconciliationService,
  ) {}

  // ── Reconciliation trigger ──────────────────────────────

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déclencher une réconciliation géographique' })
  @ApiOkResponse({ description: 'Réconciliation déclenchée' })
  async triggerReconciliation(@Body('hours') hours?: number) {
    const lookback = hours || 24;
    await this.geoReconciliationService.reconcileRecentEntities(lookback);
    return {
      success: true,
      message: `Reconciliation triggered for the last ${lookback} hours.`,
    };
  }

  // ── List all ─────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister tous les quartiers (admin, GeoJSON complet)' })
  @ApiOkResponse({ description: 'Liste complète des quartiers avec géométries' })
  async listNeighbourhoods() {
    return this.neo4jGeoService.listNeighbourhoodPolygons();
  }

  // ── Overlap check ────────────────────────────────────────

  @Post('overlap-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Vérifier les superpositions et adjacences pour une géométrie candidate',
  })
  @ApiOkResponse({ description: 'Résultat de la vérification' })
  @ApiBadRequestResponse({ description: 'Géométrie invalide' })
  async overlapCheck(@Body() dto: OverlapCheckDto) {
    return this.neo4jGeoService.checkOverlap(dto.geometry);
  }

  // ── Create ───────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un quartier' })
  @ApiCreatedResponse({ description: 'Quartier créé avec centroïde et adjacences calculés' })
  @ApiBadRequestResponse({ description: 'Données ou géométrie invalides' })
  async createNeighbourhood(@Body() dto: CreateNeighbourhoodDto) {
    return this.neo4jGeoService.createNeighbourhood(dto.geometry, {
      pg_id: dto.pg_id,
      name: dto.name,
      city: dto.city,
      zip_code: dto.zip_code,
      country: dto.country,
    });
  }

  // ── Update (metadata + optional geometry) ────────────────

  @Patch(':neighbourhood_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Modifier un quartier (métadonnées + géométrie optionnelle)',
    description:
      'Met à jour les champs fournis. Si geometry est présente, recalcule centroïde, aire et adjacences.',
  })
  @ApiOkResponse({ description: 'Quartier mis à jour' })
  @ApiBadRequestResponse({ description: 'Données ou géométrie invalides' })
  @ApiNotFoundResponse({ description: 'Quartier introuvable' })
  async updateNeighbourhood(
    @Param('neighbourhood_id') pgId: string,
    @Body() dto: UpdateNeighbourhoodDto,
  ) {
    return this.neo4jGeoService.updateNeighbourhood(pgId, dto);
  }

  // ── Delete ───────────────────────────────────────────────

  @Delete(':neighbourhood_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer un quartier',
    description: '⚠️ Bloqué si des utilisateurs y résident (LIVES_IN Neo4j)',
  })
  @ApiOkResponse({ description: 'Quartier supprimé' })
  @ApiConflictResponse({ description: 'Impossible : des résidents existent dans ce quartier' })
  @ApiNotFoundResponse({ description: 'Quartier introuvable' })
  async deleteNeighbourhood(@Param('neighbourhood_id') pgId: string) {
    await this.neo4jGeoService.deleteNeighbourhood(pgId);
    return { success: true };
  }
}
