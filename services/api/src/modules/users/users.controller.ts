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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UserMediaService } from './user-media.service';
import { UserSecurityService } from './user-security.service';
import { UserPreferencesService } from './user-preferences.service';
import { UserRgpdService } from './user-rgpd.service';
import { UserDiscoveryService } from './user-discovery.service';
import { UserSocialService } from './user-social.service';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  OptOutDto,
  PaginationDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RectifyDataDto,
  ReportUserDto,
  SwipeDto,
  UpdateLocaleDto,
  UpdateNotifPrefsDto,
  UpdateProfileDto,
} from './dto/user-routes.dtos';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mediaService: UserMediaService,
    private readonly securityService: UserSecurityService,
    private readonly preferencesService: UserPreferencesService,
    private readonly rgpdService: UserRgpdService,
    private readonly discoveryService: UserDiscoveryService,
    private readonly socialService: UserSocialService,
  ) {}

  private extractRefreshTokenFromCookie(request: any): string | undefined {
    const cookieHeader = request.headers?.cookie;
    if (!cookieHeader) {
      return undefined;
    }
    const cookies = cookieHeader.split(';').reduce((acc: any, cookie: any) => {
      const parts = cookie.split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        acc[name] = value;
      }
      return acc;
    }, {} as Record<string, string>);
    return cookies['refresh_token'];
  }

  // --- Profile ---

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consulter son profil complet' })
  async getMe(@Req() req: { user: JwtPayload }) {
    return this.usersService.getProfile(req.user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier son profil' })
  async updateMe(@Req() req: { user: JwtPayload }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.sub, dto);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer son compte (soft delete)' })
  async deleteMe(@Req() req: { user: JwtPayload }, @Body('totpCode') totpCode: string) {
    await this.usersService.softDelete(req.user.sub, totpCode);
  }

  // --- RGPD Export ---

  @Get('me/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exporter ses données personnelles en JSON' })
  async exportJson(@Req() req: { user: JwtPayload }, @Res() res: Response) {
    const data = await this.usersService.exportJson(req.user.sub);
    res.setHeader('Content-Disposition', `attachment; filename="export-rgpd-${req.user.sub}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  }

  @Get('me/export/csv')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exporter ses données personnelles en CSV' })
  async exportCsv(@Req() req: { user: JwtPayload }, @Res() res: Response) {
    const csv = await this.usersService.exportCsv(req.user.sub);
    res.setHeader('Content-Disposition', `attachment; filename="export-rgpd-${req.user.sub}.csv"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  }

  // --- Media ---

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload avatar' })
  async uploadAvatar(@Req() req: { user: JwtPayload }, @UploadedFile() file: Express.Multer.File) {
    const mediaId = await this.mediaService.uploadMedia(req.user.sub, file, 'avatar');
    return { profilePictureMongoId: mediaId };
  }

  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer son avatar' })
  async deleteAvatar(@Req() req: { user: JwtPayload }) {
    await this.mediaService.deleteMedia(req.user.sub, 'avatar');
  }

  @Post('me/banner')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload bannière' })
  async uploadBanner(@Req() req: { user: JwtPayload }, @UploadedFile() file: Express.Multer.File) {
    const mediaId = await this.mediaService.uploadMedia(req.user.sub, file, 'banner');
    return { bannerMongoId: mediaId };
  }

  @Delete('me/banner')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer sa bannière' })
  async deleteBanner(@Req() req: { user: JwtPayload }) {
    await this.mediaService.deleteMedia(req.user.sub, 'banner');
  }

  // --- Security ---

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Changer de mot de passe' })
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const refreshToken = this.extractRefreshTokenFromCookie(req);
    await this.securityService.changePassword(req.user.sub, dto, refreshToken);
  }

  @Patch('me/email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Changer d'adresse email" })
  async changeEmail(@Req() req: { user: JwtPayload }, @Body() dto: ChangeEmailDto) {
    await this.securityService.changeEmail(req.user.sub, dto);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander une réinitialisation de mot de passe' })
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    await this.securityService.requestPasswordReset(dto.email);
    return { message: 'Si le compte existe, un email a été envoyé' };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmer la réinitialisation de mot de passe' })
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    await this.securityService.confirmPasswordReset(dto.token, dto.newPassword);
    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  // --- Preferences ---

  @Get('me/locale')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lire la langue active' })
  async getLocale(@Req() req: { user: JwtPayload }) {
    return this.preferencesService.getLocale(req.user.sub);
  }

  @Patch('me/locale')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier la langue active' })
  async updateLocale(@Req() req: { user: JwtPayload }, @Body() dto: UpdateLocaleDto) {
    return this.preferencesService.updateLocale(req.user.sub, dto.locale);
  }

  @Get('me/notifications/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lire ses préférences de notifications' })
  async getNotifPrefs(@Req() req: { user: JwtPayload }) {
    return this.preferencesService.getNotificationPreferences(req.user.sub);
  }

  @Patch('me/notifications/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier ses préférences de notifications' })
  async updateNotifPrefs(@Req() req: { user: JwtPayload }, @Body() dto: UpdateNotifPrefsDto) {
    return this.preferencesService.updateNotificationPreferences(req.user.sub, dto);
  }

  // --- RGPD Right of Rectification / Restriction / Opposition ---

  @Patch('me/personal-data')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rectifier ses données personnelles' })
  async rectifyPersonalData(@Req() req: { user: JwtPayload }, @Body() dto: RectifyDataDto) {
    await this.rgpdService.rectifyPersonalData(req.user.sub, dto);
  }

  @Post('me/data-processing/opt-out')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "S'opposer à un traitement" })
  async addOptOut(@Req() req: { user: JwtPayload }, @Body() dto: OptOutDto) {
    await this.rgpdService.addOptOut(req.user.sub, dto.processingType);
    return { message: 'Opposition enregistrée' };
  }

  @Get('me/data-processing/opt-out')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister ses oppositions' })
  async getOptOuts(@Req() req: { user: JwtPayload }) {
    const optOuts = await this.rgpdService.getOptOuts(req.user.sub);
    return { optOuts };
  }

  @Delete('me/data-processing/opt-out')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer une opposition' })
  async removeOptOut(@Req() req: { user: JwtPayload }, @Body() dto: OptOutDto) {
    await this.rgpdService.removeOptOut(req.user.sub, dto.processingType);
  }

  @Post('me/data-processing/restrict')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activer la limitation du traitement' })
  async restrict(@Req() req: { user: JwtPayload }) {
    await this.rgpdService.activateRestriction(req.user.sub);
    return { message: 'Limitation active' };
  }

  @Delete('me/data-processing/restrict')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver la limitation du traitement' })
  async unrestrict(@Req() req: { user: JwtPayload }) {
    await this.rgpdService.deactivateRestriction(req.user.sub);
  }

  // --- Discovery / Search ---

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rechercher des utilisateurs' })
  async search(
    @Req() req: { user: JwtPayload },
    @Query('q') query: string,
    @Query('neighbourhood') neighbourhood?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.discoveryService.search(req.user.sub, query, neighbourhood, pagination);
  }

  @Get('discover')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fil de découverte' })
  async discover(@Req() req: { user: JwtPayload }, @Query() pagination?: PaginationDto) {
    return this.discoveryService.getDiscoverFeed(req.user.sub, pagination);
  }

  @Get('me/swipes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historique des swipes' })
  async getSwipes(@Req() req: { user: JwtPayload }, @Query() pagination?: PaginationDto) {
    return this.discoveryService.getSwipeHistory(req.user.sub, pagination);
  }

  @Get('me/blocks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des utilisateurs bloqués' })
  async getBlocks(@Req() req: { user: JwtPayload }, @Query() pagination?: PaginationDto) {
    return this.socialService.getBlocked(req.user.sub, pagination);
  }

  @Get(':user_id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Consulter le profil d'un tiers" })
  async getPublicProfile(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    return this.usersService.getPublicProfile(req.user.sub, targetId);
  }

  @Post(':user_id/swipe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Swipe de profil' })
  async swipe(
    @Req() req: { user: JwtPayload },
    @Param('user_id') targetId: string,
    @Body() dto: SwipeDto,
  ) {
    await this.discoveryService.swipe(req.user.sub, targetId, dto);
    return { message: 'Swipe enregistré' };
  }

  @Post(':user_id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suivre un utilisateur' })
  async follow(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    await this.socialService.follow(req.user.sub, targetId);
    return { message: 'Utilisateur suivi' };
  }

  @Delete(':user_id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ne plus suivre un utilisateur' })
  async unfollow(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    await this.socialService.unfollow(req.user.sub, targetId);
  }

  @Get(':user_id/followers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des followers' })
  async getFollowers(
    @Req() req: { user: JwtPayload },
    @Param('user_id') targetId: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.socialService.getFollowers(targetId, pagination);
  }

  @Get(':user_id/following')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des following' })
  async getFollowing(
    @Req() req: { user: JwtPayload },
    @Param('user_id') targetId: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.socialService.getFollowing(targetId, pagination);
  }

  @Get(':user_id/friends')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des amis (follow mutuel)' })
  async getFriends(
    @Req() req: { user: JwtPayload },
    @Param('user_id') targetId: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.socialService.getFriends(targetId, pagination);
  }

  @Post(':user_id/block')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloquer un utilisateur' })
  async block(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    await this.socialService.block(req.user.sub, targetId);
    return { message: 'Utilisateur bloqué' };
  }

  @Delete(':user_id/block')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Débloquer un utilisateur' })
  async unblock(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    await this.socialService.unblock(req.user.sub, targetId);
  }

  @Post(':user_id/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Signaler un utilisateur' })
  async report(
    @Req() req: { user: JwtPayload },
    @Param('user_id') targetId: string,
    @Body() dto: ReportUserDto,
  ) {
    await this.socialService.report(req.user.sub, targetId, dto.reason);
    return { message: 'Signalement enregistré' };
  }
}
