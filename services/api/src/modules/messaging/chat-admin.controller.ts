import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ChatMessageService } from './chat-message.service';

@ApiTags('Admin / Chat')
@Controller('admin/messages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
@ApiBearerAuth()
export class ChatAdminController {
  constructor(private readonly chatMessageService: ChatMessageService) {}

  @Get(':message_id')
  @ApiOperation({ summary: 'Lire un message (modérateur/admin) — contourne l\'appartenance au groupe' })
  @ApiOkResponse({ description: 'Message déchiffré' })
  @ApiForbiddenResponse({ description: 'Réservé aux modérateurs et administrateurs' })
  @ApiNotFoundResponse({ description: 'Message ou clé de chiffrement introuvable' })
  async getMessage(@Param('message_id') messageId: string) {
    return this.chatMessageService.getMessageAsAdmin(messageId);
  }

  @Delete(':message_id')
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
