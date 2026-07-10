import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import { QueueHealthService } from './queue-health.service';

@ApiTags('Health')
@Controller('health/queues')
export class QueueHealthController {
  constructor(private readonly queueHealthService: QueueHealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Métriques des queues BullMQ',
    description: 'État des files d\'attente (attente, actifs, complétés, échoués) pour chaque worker.',
  })
  @ApiOkResponse({ description: 'Métriques récupérées' })
  @ApiServiceUnavailableResponse({ description: 'Redis ou queues indisponibles' })
  async checkHealth() {
    const health = await this.queueHealthService.getMetrics();

    if (health.status === 'error') {
      throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
