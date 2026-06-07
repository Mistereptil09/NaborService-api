import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminConfigService } from './admin-config.service';
import { UpdateConfigDto } from './dto/update-config.dto';

@ApiTags('Admin')
@Controller('admin/config')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminConfigController {
  constructor(private readonly configService: AdminConfigService) {}

  @Get()
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consulter la configuration globale de la plateforme (Admin)' })
  @ApiOkResponse({ description: 'Configuration globale retournée' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getConfig() {
    return this.configService.getConfig();
  }

  @Patch()
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Modifier la configuration globale de la plateforme (Admin)' })
  @ApiOkResponse({ description: 'Configuration globale mise à jour' })
  @ApiForbiddenResponse({ description: 'Action réservée aux administrateurs' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async updateConfig(@Body() dto: UpdateConfigDto) {
    return this.configService.updateConfig(dto);
  }
}
