import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Historique paginé des notifications + non-lues' })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Req() req: any,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedOffset = Math.max(0, Number(offset) || 0);
    const parsedLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
    return this.notificationsService.getForUser(
      req.user.sub,
      parsedOffset,
      parsedLimit,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Nombre de notifications non lues' })
  async unreadCount(@Req() req: any) {
    const count = await this.notificationsService.getUnreadCount(req.user.sub);
    return { unreadCount: count };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marquer toutes les notifications comme lues' })
  async markAllAsRead(@Req() req: any): Promise<void> {
    await this.notificationsService.markAllAsRead(req.user.sub);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  async markAsRead(@Req() req: any, @Param('id') id: string): Promise<void> {
    await this.notificationsService.markAsRead(id, req.user.sub);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer toutes les notifications' })
  async deleteAll(@Req() req: any): Promise<void> {
    await this.notificationsService.deleteAll(req.user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une notification' })
  async delete(@Req() req: any, @Param('id') id: string): Promise<void> {
    await this.notificationsService.delete(id, req.user.sub);
  }
}
