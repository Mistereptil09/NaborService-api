import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SyncService } from '../sync/sync.service';
import {
  SyncUpdatesBatchDto,
  SyncUpdatesResponseDto,
} from '../sync/dto/sync-push.dto';

@Injectable()
export class IncidentSyncService {
  private readonly logger = new Logger(IncidentSyncService.name);

  constructor(private readonly syncService: SyncService) {}

  async syncBatch(dto: SyncUpdatesBatchDto): Promise<SyncUpdatesResponseDto> {
    const nonIncident = dto.updates.find((u) => u.entity_type !== 'incident');
    if (nonIncident) {
      this.logger.warn(
        `Rejected sync batch ${dto.jobId}: contains non-incident entity_type "${nonIncident.entity_type}"`,
      );
      throw new BadRequestException(
        'POST /sync/updates with entity_type=incident is the accepted path for incident sync. ' +
          'This batch contains non-incident entity types.',
      );
    }

    return this.syncService.syncUpdates(dto);
  }
}
