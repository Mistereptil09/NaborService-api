import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BanService, NoResultsError } from './ban.service';
import { Neo4jGeoService } from './neo4j-geo.service';
import { GeoAutocompleteQueryDto, GeoResolveQueryDto } from './dto/geo-routes.dtos';

@ApiTags('Geo')
@Controller('geo')
export class GeoController {
  constructor(
    private readonly banService: BanService,
    private readonly neo4jGeoService: Neo4jGeoService,
  ) { }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Autocompléter une adresse via la BAN' })
  @ApiOkResponse({ description: 'Liste d’adresses BAN qui sont proche de la valeur d\'entrée' })
  @ApiBadRequestResponse({ description: 'Paramètres de recherche invalides' })
  async autocomplete(@Query() query: GeoAutocompleteQueryDto) {
    return this.banService.autocomplete(query.q, query.limit);
  }

  @Get('resolve-neighbourhood')
  @ApiOperation({ summary: 'Résoudre un quartier depuis une adresse' })
  @ApiOkResponse({ description: 'Quartier résolu depuis une adresse' })
  @ApiNotFoundResponse({ description: 'Aucun quartier trouvé pour cette adresse' })
  @ApiBadRequestResponse({ description: 'Adresse invalide' })
  async resolveNeighbourhood(@Query() query: GeoResolveQueryDto) {
    try {
      const assignment = await this.banService.geocode(query.q, 1);
      return this.neo4jGeoService.assignNeighbourhood(
        assignment.latitude,
        assignment.longitude,
      );
    } catch (e) {
      if (e instanceof NoResultsError) {
        throw new NotFoundException('Aucun quartier trouvé pour cette adresse');
      }
      throw e;
    }
  }
}
