import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiFoundResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UpdatesService } from './updates.service';

@ApiTags('Updates')
@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('latest')
  @ApiOperation({
    summary: 'Dernière version disponible du client Java Desktop',
    description:
      'Proxy du manifeste `latest.json` publié en asset de la dernière ' +
      'GitHub Release du client (avec cache). Le client Java compare ' +
      '`version` avec sa version locale, puis télécharge `download_url` ' +
      'et vérifie le SHA-256 avant de remplacer son installation.',
  })
  @ApiOkResponse({
    description: 'Manifeste de la dernière version',
    schema: {
      type: 'object',
      properties: {
        version: { type: 'string', example: '1.2.0' },
        sha256: { type: 'string', example: 'abc123def456...' },
        changelog_url: {
          type: 'string',
          example: 'https://github.com/org/repo/releases/tag/v1.2.0',
        },
        download_url: {
          type: 'string',
          example:
            'https://github.com/org/repo/releases/download/v1.2.0/nabor-desktop.zip',
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'Manifeste indisponible (GitHub injoignable, aucun cache)',
  })
  async getLatest() {
    return this.updatesService.getLatest();
  }

  @Get('download')
  @ApiOperation({
    summary: 'Télécharger le bundle ZIP du client Java Desktop',
    description:
      'Redirige (302) vers l’asset `nabor-desktop.zip` de la dernière ' +
      'GitHub Release. Le client vérifie le hash SHA-256 après ' +
      'téléchargement avant de remplacer son installation.',
  })
  @ApiFoundResponse({ description: 'Redirection vers l’asset GitHub Release' })
  @ApiNotFoundResponse({
    description: 'Aucune URL de téléchargement dans le manifeste',
  })
  @ApiServiceUnavailableResponse({
    description: 'Manifeste indisponible (GitHub injoignable, aucun cache)',
  })
  async download(@Res() res: Response) {
    const url = await this.updatesService.getDownloadUrl();
    res.redirect(302, url);
  }
}
