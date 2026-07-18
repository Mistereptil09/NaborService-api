import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { ChatGateway } from './chat.gateway';
import { AdminEditMessageDto } from './dto/admin-edit-message.dto';

@ApiTags('Admin / Chat')
@Controller('admin/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
@ApiBearerAuth()
export class ChatAdminController {
  constructor(
    private readonly chatMessageService: ChatMessageService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  // ── Groups ──────────────────────────────────────────────

  @Get('groups')
  @ApiOperation({
    summary: 'Lister tous les groupes (modérateur/admin)',
    description:
      'Retourne tous les groupes non supprimés avec le nombre de membres actifs.',
  })
  @ApiOkResponse({ description: 'Liste des groupes' })
  async getGroups() {
    return this.chatService.getAllGroups();
  }

  @Get('groups/:group_id/messages')
  @ApiOperation({
    summary: "Historique des messages d'un groupe (modérateur/admin)",
    description: "Contourne l'appartenance au groupe. Pagination cursor-based.",
  })
  @ApiOkResponse({ description: 'Messages déchiffrés' })
  @ApiForbiddenResponse({
    description: 'Réservé aux modérateurs et administrateurs',
  })
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

  @Get('groups/:group_id/pinned')
  @ApiOperation({
    summary: "Messages épinglés d'un groupe (modérateur/admin)",
    description: "Liste complète, non paginée, sans contrôle d'appartenance.",
  })
  @ApiOkResponse({ description: 'Messages épinglés déchiffrés' })
  @ApiNotFoundResponse({ description: 'Groupe introuvable' })
  async getGroupPinned(@Param('group_id') groupId: string) {
    return this.chatMessageService.getPinnedMessagesAsAdmin(groupId);
  }

  @Get('groups/:group_id/attachments')
  @ApiOperation({
    summary: "Fichiers partagés d'un groupe (modérateur/admin)",
    description:
      "Toutes les pièces jointes des messages non supprimés, sans contrôle d'appartenance.",
  })
  @ApiOkResponse({ description: 'Fichiers partagés du groupe' })
  @ApiNotFoundResponse({ description: 'Groupe introuvable' })
  async getGroupAttachments(@Param('group_id') groupId: string) {
    return this.chatMessageService.getGroupAttachmentsAsAdmin(groupId);
  }

  // ── Messages ────────────────────────────────────────────

  @Get('messages/:message_id')
  @ApiOperation({
    summary:
      "Lire un message (modérateur/admin) — contourne l'appartenance au groupe",
  })
  @ApiOkResponse({ description: 'Message déchiffré' })
  @ApiForbiddenResponse({
    description: 'Réservé aux modérateurs et administrateurs',
  })
  @ApiNotFoundResponse({
    description: 'Message ou clé de chiffrement introuvable',
  })
  async getMessage(@Param('message_id') messageId: string) {
    return this.chatMessageService.getMessageAsAdmin(messageId);
  }

  @Patch('messages/:message_id')
  @ApiOperation({
    summary: "Modifier le contenu d'un message (modérateur/admin)",
    description:
      "Réécrit le texte déchiffré de n'importe quel message (les deux côtés d'une conversation), le re-chiffre sous la clé du groupe et notifie les clients connectés.",
  })
  @ApiOkResponse({ description: 'Message modifié (déchiffré)' })
  @ApiForbiddenResponse({
    description: 'Réservé aux modérateurs et administrateurs',
  })
  @ApiNotFoundResponse({ description: 'Message introuvable' })
  async editMessage(
    @Param('message_id') messageId: string,
    @Body() dto: AdminEditMessageDto,
  ) {
    const message = await this.chatMessageService.editMessageAsModerator(
      messageId,
      dto.content,
    );
    this.chatGateway.emitToGroup(message.group_id, 'message:edited', {
      message_id: message.id,
      new_content: message.content,
      edited_at: message.edited_at,
    });
    return message;
  }

  @Delete('messages/:message_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer un message (modérateur/admin)' })
  @ApiOkResponse({ description: 'Message supprimé' })
  @ApiForbiddenResponse({
    description: 'Réservé aux modérateurs et administrateurs',
  })
  @ApiNotFoundResponse({ description: 'Message introuvable' })
  async deleteMessage(@Param('message_id') messageId: string, @Req() req: any) {
    // Récupère le groupe avant suppression pour pouvoir notifier sa room.
    const before = await this.chatMessageService.getMessageAsAdmin(messageId);
    const result = await this.chatMessageService.softDeleteMessageAsModerator(
      messageId,
      req.user.sub,
    );
    this.chatGateway.emitToGroup(before.group_id, 'message:deleted', {
      message_id: messageId,
      deleted_at: new Date().toISOString(),
    });
    return result;
  }

  @Post('messages/:message_id/pin')
  @ApiOperation({
    summary:
      'Épingler un message (modérateur/admin) — contourne le rôle de groupe',
  })
  @ApiOkResponse({ description: 'Message épinglé' })
  @ApiNotFoundResponse({ description: 'Message introuvable' })
  async pinMessage(
    @Param('message_id') messageId: string,
    @Req() req: { user: { sub: string } },
  ) {
    const message = await this.chatMessageService.pinMessageAsModerator(
      messageId,
      req.user.sub,
    );
    this.chatGateway.emitToGroup(message.group_id, 'message:pinned', message);
    return message;
  }

  @Delete('messages/:message_id/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Désépingler un message (modérateur/admin)' })
  @ApiOkResponse({ description: 'Message désépinglé' })
  @ApiNotFoundResponse({ description: 'Message introuvable' })
  async unpinMessage(@Param('message_id') messageId: string) {
    const message =
      await this.chatMessageService.unpinMessageAsModerator(messageId);
    this.chatGateway.emitToGroup(message.group_id, 'message:unpinned', message);
    return message;
  }
}
