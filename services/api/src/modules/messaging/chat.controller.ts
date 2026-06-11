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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/auth.interfaces';
import { ChatService } from './chat.service';
import { ChatMessageService } from './chat-message.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
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
  @ApiOperation({ summary: 'Groupes de l\'utilisateur connecté' })
  async getGroups(@Req() req: any) {
    return this.chatService.getUserGroups(req.user.sub);
  }

  @Post('groups')
  @ApiOperation({ summary: 'Créer un groupe de discussion' })
  async createGroup(@Req() req: any, @Body() dto: CreateGroupDto) {
    return this.chatService.createGroup(req.user.sub, dto);
  }

  @Get('groups/:group_id')
  @ApiOperation({ summary: 'Détail d\'un groupe' })
  async getGroup(@Param('group_id') groupId: string) {
    return this.chatService.getGroupDetail(groupId);
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
    return this.chatService.getMembers(groupId);
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
  @ApiOperation({ summary: 'Modifier le rôle d\'un membre (admin uniquement)' })
  async changeRole(
    @Param('group_id') groupId: string,
    @Param('user_id') userId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: ChangeRoleDto,
  ) {
    return this.chatService.changeRole(groupId, userId, dto.role, req.user.sub);
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
  async getMessages(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.chatMessageService.getMessages(
      groupId,
      req.user.sub,
      cursor,
      limit ?? 50,
    );
  }

  @Post('groups/:group_id/messages')
  @ApiOperation({ summary: 'Envoyer un message (REST fallback)' })
  async sendMessage(
    @Param('group_id') groupId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: SendMessageDto,
  ) {
    return this.chatMessageService.sendMessage(groupId, req.user.sub, dto);
  }

  @Get('messages/:message_id')
  @ApiOperation({ summary: 'Détail d\'un message' })
  async getMessage(@Param('message_id') messageId: string, @Req() req: any) {
    return this.chatMessageService.getMessage(messageId, req.user.sub);
  }

  @Patch('messages/:message_id')
  @ApiOperation({ summary: 'Modifier son message' })
  async editMessage(
    @Param('message_id') messageId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: EditMessageDto,
  ) {
    return this.chatMessageService.editMessage(messageId, req.user.sub, dto.new_content);
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
}
