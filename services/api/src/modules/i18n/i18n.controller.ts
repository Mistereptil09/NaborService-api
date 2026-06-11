import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse } from '@nestjs/swagger';

interface Language {
  code: string;
  name: string;
  flag: string; // ISO 3166-1 alpha-2 country code used as a flag hint
}

const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'fr', name: 'Français', flag: 'FR' },
  { code: 'en', name: 'English', flag: 'GB' },
];

@ApiTags('i18n')
@Controller('i18n')
export class I18nController {
  @Get('languages')
  @ApiOperation({ summary: 'Lister les langues supportées par la plateforme' })
  @ApiOkResponse({
    description: 'Liste des langues disponibles',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'fr' },
          name: { type: 'string', example: 'Français' },
          flag: { type: 'string', example: 'FR' },
        },
      },
    },
  })
  getLanguages(): Language[] {
    return SUPPORTED_LANGUAGES;
  }
}
