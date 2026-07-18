import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  BanService,
  BanServerException,
  BanTimeoutException,
  BanUnavailableException,
  NoResultsError,
} from './ban.service';
import { Neo4jGeoService } from './neo4j-geo.service';
import {
  GeoAutocompleteQueryDto,
  GeoResolveQueryDto,
} from './dto/geo-routes.dtos';

@ApiTags('Geo')
@Controller('geo')
export class GeoController {
  constructor(
    private readonly banService: BanService,
    private readonly neo4jGeoService: Neo4jGeoService,
  ) {}

  @Get('autocomplete')
  @ApiOperation({ summary: 'Autocompléter une adresse via la BAN' })
  @ApiOkResponse({
    description: "Liste d'adresses BAN qui sont proche de la valeur d'entrée",
  })
  @ApiBadRequestResponse({ description: 'Paramètres de recherche invalides' })
  async autocomplete(@Query() query: GeoAutocompleteQueryDto) {
    try {
      return await this.banService.autocomplete(query.q, query.limit);
    } catch (error) {
      if (error instanceof BanTimeoutException) {
        throw new HttpException(
          'Service BAN temporairement indisponible (timeout)',
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      if (error instanceof BanServerException) {
        throw new HttpException(
          'Service BAN en erreur',
          HttpStatus.BAD_GATEWAY,
        );
      }
      if (error instanceof BanUnavailableException) {
        throw new HttpException(
          'Service BAN indisponible',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }
  }

  @Get('resolve-neighbourhood')
  @ApiOperation({ summary: 'Résoudre un quartier depuis une adresse' })
  @ApiOkResponse({ description: 'Quartier résolu depuis une adresse' })
  @ApiNotFoundResponse({
    description: 'Aucun quartier trouvé pour cette adresse',
  })
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
