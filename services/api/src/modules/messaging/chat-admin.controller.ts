import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ChatMessageService } from './chat-message.service';
import { ChatService } from './chat.service';

@ApiTags('Admin / Chat')
@Controller('admin/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
@ApiBearerAuth()
export class ChatAdminController {
  constructor(
    private readonly chatMessageService: ChatMessageService,
    private readonly chatService: ChatService,
  ) {}

  // ── Groups ──────────────────────────────────────────────

  @Get('groups')
  @ApiOperation({
    summary: 'Lister tous les groupes (modérateur/admin)',
    description: 'Retourne tous les groupes non supprimés avec le nombre de membres actifs.',
  })
  @ApiOkResponse({ description: 'Liste des groupes' })
  async getGroups() {
    return this.chatService.getAllGroups();
  }

  @Get('groups/:group_id/messages')
  @ApiOperation({
    summary: 'Historique des messages d\'un groupe (modérateur/admin)',
    description: 'Contourne l\'appartenance au groupe. Pagination cursor-based.',
  })
  @ApiOkResponse({ description: 'Messages déchiffrés' })
  @ApiForbiddenResponse({ description: 'Réservé aux modérateurs et administrateurs' })
  @ApiNotFoundResponse({ description: 'Groupe introuvable' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getGroupMessages(
    @Param('group_id') groupId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.chatMessageService.getMessagesAsAdmin(
      groupId,
      cursor,
      limit ?? 50,
    );
  }

  // ── Messages ────────────────────────────────────────────

  @Get('messages/:message_id')
  @ApiOperation({ summary: 'Lire un message (modérateur/admin) — contourne l\'appartenance au groupe' })
  @ApiOkResponse({ description: 'Message déchiffré' })
  @ApiForbiddenResponse({ description: 'Réservé aux modérateurs et administrateurs' })
  @ApiNotFoundResponse({ description: 'Message ou clé de chiffrement introuvable' })
  async getMessage(@Param('message_id') messageId: string) {
    return this.chatMessageService.getMessageAsAdmin(messageId);
  }

  @Delete('messages/:message_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer un message (modérateur/admin)' })
  @ApiOkResponse({ description: 'Message supprimé' })
  @ApiForbiddenResponse({ description: 'Réservé aux modérateurs et administrateurs' })
  @ApiNotFoundResponse({ description: 'Message introuvable' })
  async deleteMessage(
    @Param('message_id') messageId: string,
    @Req() req: any,
  ) {
    return this.chatMessageService.softDeleteMessageAsModerator(
      messageId,
      req.user.sub,
    );
  }
}
