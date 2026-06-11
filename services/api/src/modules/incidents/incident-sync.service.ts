import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SyncService } from '../sync/sync.service';
import { SyncUpdatesBatchDto, SyncUpdatesResponseDto } from '../sync/dto/sync-push.dto';

/**
 * Dedicated service that handles incident-specific sync concerns for the
 * Java Desktop offline-first client.
 *
 * The generic `POST /sync/updates` with `entity_type: 'incident'` is the
 * authoritative sync path (replaces the legacy `POST /incidents/sync`
 * referenced in CDC §3.5). This service wraps the generic SyncService
 * with incident-scoped validation and post-processing.
 *
 * ## is_dirty flag
 *
 * `is_dirty` is purely a SQLite client concern (CDC §3.5). The server does NOT
 * store or reconcile it. After a successful sync via `POST /sync/updates`,
 * the Java client marks `is_dirty=0` locally. The server's role is limited to:
 *   1. Validating that all updates in the batch are `entity_type: 'incident'`
 *   2. Delegating to EntityPatchHandler for PG-level conflict detection + patching
 *   3. Recording conflicts for audit (handled by EntityPatchHandler)
 *
 * ## MongoDB document sync
 *
 * Incident photos and rich content are stored in MongoDB via the existing
 * `POST /media/incidents/:id/photos` upload endpoint. The sync flow for
 * offline-created incidents follows this sequence:
 *   1. Java client creates the Incident row via `POST /sync/updates`
 *   2. Java client uploads photos separately via `POST /media/incidents/:id/photos`
 *   3. Java client links `mongo_document_id` via a second `POST /sync/updates` patch
 */
@Injectable()
export class IncidentSyncService {
  private readonly logger = new Logger(IncidentSyncService.name);

  constructor(private readonly syncService: SyncService) {}

  /**
   * Validates and processes a batch of incident sync updates.
   *
   * Rejects the batch if any update is not `entity_type: 'incident'`.
   * Otherwise delegates to the generic SyncService for conflict detection
   * and PG-level patching.
   */
  async syncBatch(dto: SyncUpdatesBatchDto): Promise<SyncUpdatesResponseDto> {
    // Validate all updates are incident-scoped
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
