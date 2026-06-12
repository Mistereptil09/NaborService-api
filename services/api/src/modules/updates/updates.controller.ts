import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdatesService } from './updates.service';

@ApiTags('Updates')
@Controller('updates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
@ApiBearerAuth()
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('latest')
  @ApiOperation({
    summary: 'Dernière version disponible du client Java Desktop',
    description:
      'Retourne la version, le hash SHA-256 et le nom du fichier JAR. ' +
      'Le client Java compare avec sa version locale stockée dans SQLite. ' +
      'Si le client a `nabor.update.checkUrl` défini, il utilise GitHub Releases ' +
      'directement plutôt que cet endpoint.',
  })
  @ApiOkResponse({
    description: 'Manifeste de la dernière version',
    schema: {
      type: 'object',
      properties: {
        version: { type: 'string', example: '1.2.0' },
        sha256: { type: 'string', example: 'abc123def456...' },
        jar_filename: { type: 'string', example: 'nabor-desktop.jar' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Réservé aux modérateurs et administrateurs' })
  @ApiNotFoundResponse({ description: 'Aucun manifeste trouvé' })
  async getLatest() {
    return this.updatesService.getLatest();
  }

  @Get('download')
  @ApiOperation({
    summary: 'Télécharger le JAR du client Java Desktop',
    description:
      'Stream le fichier JAR de la dernière version. Le client vérifie ' +
      'le hash SHA-256 après téléchargement avant de remplacer son ancien JAR.',
  })
  @ApiOkResponse({ description: 'Fichier JAR' })
  @ApiForbiddenResponse({ description: 'Réservé aux modérateurs et administrateurs' })
  @ApiNotFoundResponse({ description: 'Fichier JAR introuvable' })
  async download(@Res() res: Response) {
    const { stream, filename, size } = this.updatesService.getDownloadStream();

    res.setHeader('Content-Type', 'application/java-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', size.toString());
    res.setHeader('Cache-Control', 'no-cache');

    stream.pipe(res);
  }
}
