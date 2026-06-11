import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { SyncService } from './sync.service';
import { EntityPatchHandler } from './handlers/entity-patch.handler';
import { GetSnapshotQueryDto } from './dto/sync-snapshot.dto';
import { SyncUpdatesBatchDto } from './dto/sync-push.dto';

@ApiTags('Sync')
@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly entityPatchHandler: EntityPatchHandler,
  ) {}

  @Get('snapshot')
  @Roles('moderator', 'admin')
  @ApiOperation({
    summary: 'Obtenir un delta snapshot des données (Offline Sync)',
    description:
      'Retourne toutes les entités modifiées depuis `since`. Supporte la pagination via curseur composite.\n\n' +
      '**Format du curseur :** base64(ISO_TIMESTAMP + "|" + entityType + "|" + entityId)\n\n' +
      'Le curseur composite encode la position exacte de la dernière entité incluse (timestamp, type, ID). ' +
      "À la page suivante, le serveur utilise un WHERE composite pour le type d'entité du curseur — " +
      '`(timeCol = cursorDate AND id > cursorId) OR (timeCol > cursorDate)` — évitant toute perte de données ' +
      'même lorsque plusieurs entités partagent le même timestamp (ex: batch INSERT transactionnel).\n\n' +
      "**Pagination :** boucler avec `cursor` jusqu'à `has_more = false`. Max 500 entités par page.",
  })
  async getSnapshot(@Query() query: GetSnapshotQueryDto) {
    const result = await this.syncService.getSnapshot(query);
    console.log(result);
    return result;
  }

  @Post('updates')
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Synchroniser des éditions génériques hors-ligne' })
  async syncUpdates(@Body() dto: SyncUpdatesBatchDto) {
    const result = await this.syncService.syncUpdates(dto);
    console.dir(result, { depth: null });
    return result;
  }

  @Get('whitelist')
  @Roles('moderator', 'admin')
  @ApiOperation({
    summary:
      "Obtenir la liste des champs modifiables par type d'entité (Offline Sync)",
    description:
      'Retourne les champs que le client Java peut modifier en offline. ' +
      'Toute modification sur un champ hors de cette liste est ignorée par POST /sync/updates.',
  })
  getWhitelist() {
    return {
      whitelists: this.entityPatchHandler.getWhitelists(),
      note:
        'Only fields listed here are accepted by POST /sync/updates. ' +
        'Sensitive fields (passwords, secrets, roles, Stripe IDs) are never syncable.',
    };
  }
}
