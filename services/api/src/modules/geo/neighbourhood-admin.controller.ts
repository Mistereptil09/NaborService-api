import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  BadRequestException,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Neo4jGeoService, NeighbourhoodMetadata } from './neo4j-geo.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { GeoReconciliationService } from './geo-reconciliation.service';

@Controller('admin/neighbourhoods')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NeighbourhoodAdminController {
  constructor(
    private readonly neo4jGeoService: Neo4jGeoService,
    private readonly geoReconciliationService: GeoReconciliationService,
  ) {}

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  async triggerReconciliation(@Body('hours') hours?: number) {
    const lookback = hours || 24;
    await this.geoReconciliationService.reconcileRecentEntities(lookback);
    return {
      success: true,
      message: `Reconciliation triggered for the last ${lookback} hours.`,
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createNeighbourhood(
    @Body() body: { polygon: GeoJSON.Polygon; metadata: NeighbourhoodMetadata },
  ) {
    if (!body.polygon || !body.metadata) {
      throw new BadRequestException('Missing polygon or metadata');
    }
    return await this.neo4jGeoService.createNeighbourhood(
      body.polygon,
      body.metadata,
    );
  }

  @Patch(':id/polygon')
  async updateNeighbourhoodPolygon(
    @Param('id') pgId: string,
    @Body() body: { polygon: GeoJSON.Polygon },
  ) {
    if (!body.polygon) {
      throw new BadRequestException('Missing polygon');
    }
    return await this.neo4jGeoService.updateNeighbourhoodPolygon(
      pgId,
      body.polygon,
    );
  }
}
