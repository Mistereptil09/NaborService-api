import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common';
import { QueueHealthService } from './queue-health.service';

@Controller('health/queues')
export class QueueHealthController {
  constructor(private readonly queueHealthService: QueueHealthService) {}

  @Get()
  async checkHealth() {
    const health = await this.queueHealthService.getMetrics();

    if (health.status === 'error') {
      throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
