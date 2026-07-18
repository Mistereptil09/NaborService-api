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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/auth.interfaces';
import { ChatService } from './chat.service';
import { ChatMessageService } from './chat-message.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { MuteDto } from './dto/mute.dto';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatMessageService: ChatMessageService,
  ) {}

  // ── Groups ──────────────────────────────────────────────

  @Get('groups')
  @ApiOperation({ summary: "Groupes de l'utilisateur connecté" })
  async getGroups(@Req() req: any) {
    return this.chatService.getUserGroups(req.user.sub);
  }

  @Post('groups')
  @ApiOperation({ summary: 'Créer un groupe de discussion' })
  async createGroup(@Req() req: any, @Body() dto: CreateGroupDto) {
    return this.chatService.createGroup(req.user.sub, dto);
  }

  @Get('groups/:group_id')
  @ApiOperation({ summary: "Détail d'un groupe" })
  async getGroup(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.chatService.getGroupDetailForUser(groupId, req.user.sub);
  }

  @Patch('groups/:group_id')
  @ApiOperation({ summary: 'Modifier nom/description (rôle actions ou admin)' })
  async updateGroup(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: UpdateGroupDto,
  ) {
    return this.chatService.updateGroup(groupId, req.user.sub, dto);
  }

  @Delete('groups/:group_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer le groupe (admin uniquement)' })
  async deleteGroup(@Param('group_id') groupId: string, @Req() req: any) {
    return this.chatService.softDeleteGroup(groupId, req.user.sub);
  }

  // ── Members ─────────────────────────────────────────────

  @Get('groups/:group_id/members')
  @ApiOperation({ summary: 'Liste des membres du groupe' })
  async getMembers(@Param('group_id') groupId: string) {
    const memberships = await this.chatService.getMembers(groupId);
    // Réponse en snake_case (convention REST du module) avec l'identité de
    // l'utilisateur déjà jointe (relation `user` chargée par le service) —
    // évite tout lookup N+1 côté client pour afficher la liste des membres.
    return memberships.map((m) => ({
      user_id: m.userId,
      role: m.roleInGroup,
      joined_at: m.joinedAt,
      first_name: m.user?.firstName ?? null,
      last_name: m.user?.lastName ?? null,
      profile_picture_mongo_id: m.user?.profilePictureMongoId ?? null,
    }));
  }

  @Post('groups/:group_id/members')
  @ApiOperation({ summary: 'Inviter un membre (rôle actions ou admin)' })
  async addMember(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: AddMemberDto,
  ) {
    return this.chatService.addMember(groupId, dto.user_id, req.user.sub);
  }

  @Delete('groups/:group_id/members/:user_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer un membre ou quitter le groupe' })
  async removeMember(
    @Param('group_id') groupId: string,
    @Param('user_id') userId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.chatService.removeMember(groupId, userId, req.user.sub);
  }

  @Patch('groups/:group_id/members/:user_id')
  @ApiOperation({ summary: "Modifier le rôle d'un membre (admin uniquement)" })
  async changeRole(
    @Param('group_id') groupId: string,
    @Param('user_id') userId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: ChangeRoleDto,
  ) {
    return this.chatService.changeRole(groupId, userId, dto.role, req.user.sub);
  }

  // ── Read pointer ────────────────────────────────────────

  @Post('groups/:group_id/read')
  @ApiOperation({
    summary: 'Marquer la conversation comme lue (badge non-lus)',
  })
  async markGroupRead(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
  ) {
    await this.chatService.markGroupRead(groupId, req.user.sub);
    return { group_id: groupId, read: true };
  }

  // ── Mute ────────────────────────────────────────────────

  @Post('groups/:group_id/mute')
  @ApiOperation({ summary: 'Activer la sourdine pour soi-même' })
  async mute(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: MuteDto,
  ) {
    return this.chatService.mute(groupId, req.user.sub, dto.duration_minutes);
  }

  @Delete('groups/:group_id/mute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Désactiver la sourdine' })
  async unmute(@Param('group_id') groupId: string, @Req() req: any) {
    return this.chatService.unmute(groupId, req.user.sub);
  }

  // ── Messages ────────────────────────────────────────────

  @Get('groups/:group_id/messages')
  @ApiOperation({ summary: 'Historique paginé (cursor-based, déchiffré)' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'around',
    required: false,
    description:
      'Id de message : ancre la page sur son horodatage au lieu de "maintenant" (jump-to-message).',
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    description:
      '"older" (défaut) ou "newer" — avec `cursor`, remonte vers le direct après un jump-to-message.',
  })
  async getMessages(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
    @Query('around') around?: string,
    @Query('direction') direction?: 'older' | 'newer',
  ) {
    return this.chatMessageService.getMessages(
      groupId,
      req.user.sub,
      cursor,
      limit ?? 50,
      around,
      direction ?? 'older',
    );
  }

  @Get('groups/:group_id/pinned')
  @ApiOperation({
    summary: 'Messages épinglés du groupe (liste complète, non paginée)',
  })
  async getPinnedMessages(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.chatMessageService.getPinnedMessages(groupId, req.user.sub);
  }

  @Get('groups/:group_id/attachments')
  @ApiOperation({
    summary:
      'Fichiers partagés du groupe (toutes les pièces jointes, non paginé)',
    description:
      "Liste toutes les pièces jointes des messages non supprimés du groupe, triées du plus récent au plus ancien. Indépendant de la pagination du fil (un fichier ancien reste listé sans avoir à scroller jusqu'à son message). Réservé aux membres du groupe.",
  })
  @ApiOkResponse({
    description: 'Fichiers partagés du groupe',
    schema: {
      type: 'object',
      properties: {
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              message_id: {
                type: 'string',
                format: 'uuid',
                description: "Message d'origine (pour le saut vers le fil)",
              },
              sender_id: { type: 'string', format: 'uuid', nullable: true },
              sent_at: { type: 'string', format: 'date-time', nullable: true },
              media_id: {
                type: 'string',
                description: 'Id du fichier (module media / GridFS)',
              },
              filename: { type: 'string' },
              mimetype: { type: 'string' },
              size_bytes: { type: 'integer' },
              uploaded_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async getGroupAttachments(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.chatMessageService.getGroupAttachments(groupId, req.user.sub);
  }

  @Get('messages/:message_id')
  @ApiOperation({ summary: "Détail d'un message" })
  async getMessage(@Param('message_id') messageId: string, @Req() req: any) {
    return this.chatMessageService.getMessage(messageId, req.user.sub);
  }

  @Delete('messages/:message_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer un message (expéditeur ou admin)' })
  async deleteMessage(
    @Param('message_id') messageId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.chatMessageService.softDeleteMessage(messageId, req.user.sub);
  }

  // ── Pin ─────────────────────────────────────────────────

  @Post('messages/:message_id/pin')
  @ApiOperation({
    summary: 'Épingler un message (rôle actions ou admin dans le groupe)',
  })
  async pinMessage(
    @Param('message_id') messageId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.chatMessageService.pinMessage(messageId, req.user.sub);
  }

  @Delete('messages/:message_id/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Désépingler un message (rôle actions ou admin dans le groupe)',
  })
  async unpinMessage(
    @Param('message_id') messageId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.chatMessageService.unpinMessage(messageId, req.user.sub);
  }
}
