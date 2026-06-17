import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DslService } from './dsl.service';

@ApiTags('DSL')
@Controller('dsl')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DslController {
  constructor(private readonly dslService: DslService) {}

  @Post('query')
  @Roles('moderator', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exécuter une requête DSL sur MongoDB',
    description:
      'Parse et exécute une requête DSL via le micro-service Python PLY. ' +
      'Retourne le filtre MongoDB généré. Collections autorisées : ' +
      'messages, listing_documents, contracts, event_documents, ' +
      'incident_documents, event_tickets.',
  })
  @ApiOkResponse({
    description: 'Requête DSL parsée avec succès',
    schema: {
      type: 'object',
      properties: {
        collection: { type: 'string', example: 'contracts' },
        filter: { type: 'object' },
        order: { type: 'object', nullable: true },
        limit: { type: 'number', example: 20 },
        projection: { type: 'object' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Erreur de syntaxe DSL ou requête invalide',
  })
  @ApiForbiddenResponse({
    description:
      "Collection non autorisée, ou rôle insuffisant (modérateur/admin requis)",
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async executeQuery(
    @Body('query') query: string,
    @Req() req: Request & { user: { sub: string; role: string } },
  ) {
    const startTime = Date.now();

    try {
      const result = await this.dslService.parseQuery(query);

      // Log audit asynchrone (non-bloquant)
      this.dslService.logQuery({
        userId: req.user.sub,
        userRole: req.user.role,
        query,
        collection: result.collection,
        filter: result.filter,
        order: result.order ?? null,
        limit: result.limit,
        resultCount: null,
        hasError: false,
        errorMessage: null,
        ipAddress: req.ip ?? null,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erreur inconnue';

      // Log audit asynchrone même en cas d'erreur
      this.dslService.logQuery({
        userId: req.user.sub,
        userRole: req.user.role,
        query,
        collection: 'unknown',
        filter: null,
        order: null,
        limit: 100,
        resultCount: null,
        hasError: true,
        errorMessage,
        ipAddress: req.ip ?? null,
      });

      throw error;
    }
  }

  @Get('audit')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Historique des requêtes DSL exécutées',
    description:
      'Retourne la liste paginée des requêtes DSL exécutées, ' +
      'avec le filtre MongoDB généré, le statut et l\'utilisateur.',
  })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ description: 'Historique des requêtes DSL' })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getAudit(
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dslService.getAuditHistory(
      offset ? Number(offset) : 0,
      limit ? Number(limit) : 50,
    );
  }
}
