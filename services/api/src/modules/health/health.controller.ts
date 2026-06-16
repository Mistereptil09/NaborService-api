import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Healthcheck global',
    description:
      'Vérifie que le serveur NestJS répond. Utilisé par Docker healthcheck, load balancers et monitoring.',
  })
  @ApiOkResponse({ description: 'API opérationnelle' })
  health(): { status: string; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check',
    description:
      'Vérifie la connectivité de toutes les dépendances (PostgreSQL, MongoDB, Neo4j, Redis). Retourne 200 si toutes les connexions sont actives, 503 avec le détail des services indisponibles.',
  })
  @ApiOkResponse({ description: 'Tous les services sont accessibles' })
  @ApiServiceUnavailableResponse({
    description: 'Au moins un service est indisponible',
  })
  async ready(@Res() res: Response): Promise<void> {
    const result = await this.healthService.checkReadiness();

    const httpStatus =
      result.status === 'ok' || result.status === 'degraded' ? 200 : 503;
    res.status(httpStatus).json(result);
  }
}
