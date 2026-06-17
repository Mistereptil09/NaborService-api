import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NeighbourhoodService } from '../../database/neo4j/neighbourhood.service';
import { GeoNearbyQueryDto } from './dto/geo-routes.dtos';

@ApiTags('Neighbourhoods')
@Controller('neighbourhoods')
export class NeighbourhoodController {
  constructor(
    private readonly neighbourhoodService: NeighbourhoodService,
  ) {}

  // ── GET /neighbourhoods (public) ───────────────────────

  @Get()
  @ApiOperation({ summary: 'Lister tous les quartiers' })
  @ApiOkResponse({ description: 'Liste des quartiers (id, name, city, zip_code)' })
  async listAll() {
    return this.neighbourhoodService.findAll();
  }

  // ── GET /neighbourhoods/nearby (public) ────────────────

  @Get('nearby')
  @ApiOperation({
    summary: 'Quartiers proches d\'un point GPS',
    description: 'Retourne les 5 quartiers les plus proches dans un rayon donné (défaut 2000m)',
  })
  @ApiOkResponse({ description: 'Quartiers proches triés par distance' })
  async nearby(@Query() query: GeoNearbyQueryDto) {
    return this.neighbourhoodService.findNearby(
      query.lat,
      query.lng,
      query.radius ?? 2000,
    );
  }

  // ── GET /neighbourhoods/:neighbourhood_id (auth) ───────

  @Get(':neighbourhood_id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Détail complet d\'un quartier (Neo4j)' })
  @ApiOkResponse({ description: 'Détail du quartier avec géométrie et adjacences' })
  @ApiNotFoundResponse({ description: 'Quartier introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getDetail(@Param('neighbourhood_id') pgId: string) {
    const nb = await this.neighbourhoodService.findByPgId(pgId);
    if (!nb) throw new NotFoundException('Quartier introuvable');
    return nb;
  }

  // ── GET /neighbourhoods/:neighbourhood_id/members (auth)

  @Get(':neighbourhood_id/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Habitants du quartier (selon visibilité)' })
  @ApiOkResponse({ description: 'Liste des résidents' })
  @ApiNotFoundResponse({ description: 'Quartier introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getMembers(@Param('neighbourhood_id') pgId: string) {
    const nb = await this.neighbourhoodService.findByPgId(pgId);
    if (!nb) throw new NotFoundException('Quartier introuvable');
    return this.neighbourhoodService.findMembers(pgId);
  }

  // ── GET /neighbourhoods/:neighbourhood_id/adjacent (auth)

  @Get(':neighbourhood_id/adjacent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Quartiers adjacents (niveau 1)' })
  @ApiOkResponse({ description: 'Liste des quartiers adjacents' })
  @ApiNotFoundResponse({ description: 'Quartier introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getAdjacent(@Param('neighbourhood_id') pgId: string) {
    const nb = await this.neighbourhoodService.findByPgId(pgId);
    if (!nb) throw new NotFoundException('Quartier introuvable');
    if (!nb.adjacentIds || nb.adjacentIds.length === 0) return [];

    // Fetch details for each adjacent neighbourhood
    const adjacents = await Promise.all(
      nb.adjacentIds.map((id) => this.neighbourhoodService.findByPgId(id)),
    );
    return adjacents.filter(Boolean).map((a) => ({
      pgId: a!.pgId,
      name: a!.name,
      city: a!.city,
      zipCode: a!.zipCode,
      country: a!.country,
    }));
  }
}
