import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { SyncService } from './sync.service';
import { GetSnapshotQueryDto } from './dto/sync-snapshot.dto';
import { SyncUpdatesBatchDto } from './dto/sync-push.dto';

@ApiTags('Sync')
@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('snapshot')
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Obtenir un delta snapshot des données (Offline Sync)' })
  async getSnapshot(@Query() query: GetSnapshotQueryDto) {
    return this.syncService.getSnapshot(query);
  }

  @Post('updates')
  @Roles('moderator', 'admin')
  @ApiOperation({ summary: 'Synchroniser des éditions génériques hors-ligne' })
  async syncUpdates(@Body() dto: SyncUpdatesBatchDto) {
    return this.syncService.syncUpdates(dto);
  }
}
