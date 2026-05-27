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
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
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
  @ApiOkResponse({ description: 'Profil complet de l\'utilisateur connecté retourné avec succès' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getMe(@Req() req: { user: JwtPayload }) {
    return this.usersService.getProfile(req.user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier son profil' })
  @ApiOkResponse({ description: 'Profil mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Données de profil invalides' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async updateMe(@Req() req: { user: JwtPayload }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.sub, dto);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer son compte (soft delete)' })
  @ApiNoContentResponse({ description: 'Compte désactivé et supprimé logiquement avec succès' })
  @ApiBadRequestResponse({ description: 'Code TOTP invalide' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async deleteMe(@Req() req: { user: JwtPayload }, @Body('totpCode') totpCode: string) {
    await this.usersService.softDelete(req.user.sub, totpCode);
  }

  // --- RGPD Export ---

  @Get('me/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exporter ses données personnelles en JSON' })
  @ApiOkResponse({ description: 'Fichier JSON contenant toutes les données personnelles de l\'utilisateur' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
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
  @ApiOkResponse({ description: 'Archive/Fichier CSV contenant toutes les données personnelles structurées' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
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
  @ApiCreatedResponse({ description: 'Avatar téléversé et mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Fichier invalide, trop volumineux ou format non supporté' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadAvatar(@Req() req: { user: JwtPayload }, @UploadedFile() file: Express.Multer.File) {
    const mediaId = await this.mediaService.uploadMedia(req.user.sub, file, 'avatar');
    return { profilePictureMongoId: mediaId };
  }

  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer son avatar' })
  @ApiNoContentResponse({ description: 'Avatar supprimé avec succès' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async deleteAvatar(@Req() req: { user: JwtPayload }) {
    await this.mediaService.deleteMedia(req.user.sub, 'avatar');
  }

  @Post('me/banner')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload bannière' })
  @ApiCreatedResponse({ description: 'Bannière téléversée et mise à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Fichier invalide, trop volumineux ou format non supporté' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadBanner(@Req() req: { user: JwtPayload }, @UploadedFile() file: Express.Multer.File) {
    const mediaId = await this.mediaService.uploadMedia(req.user.sub, file, 'banner');
    return { bannerMongoId: mediaId };
  }

  @Delete('me/banner')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer sa bannière' })
  @ApiNoContentResponse({ description: 'Bannière supprimée avec succès' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async deleteBanner(@Req() req: { user: JwtPayload }) {
    await this.mediaService.deleteMedia(req.user.sub, 'banner');
  }

  // --- Security ---

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Changer de mot de passe' })
  @ApiNoContentResponse({ description: 'Mot de passe mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Ancien mot de passe ou code TOTP invalide, ou mot de passe non sécurisé' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const refreshToken = this.extractRefreshTokenFromCookie(req);
    await this.securityService.changePassword(req.user.sub, dto, refreshToken);
  }

  @Patch('me/email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Changer d'adresse email" })
  @ApiNoContentResponse({ description: 'Adresse email mise à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Nouvelle adresse email invalide ou code TOTP incorrect' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async changeEmail(@Req() req: { user: JwtPayload }, @Body() dto: ChangeEmailDto) {
    await this.securityService.changeEmail(req.user.sub, dto);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander une réinitialisation de mot de passe' })
  @ApiOkResponse({ description: 'Demande enregistrée. Si le compte existe, un email a été envoyé' })
  @ApiBadRequestResponse({ description: 'Format d\'email invalide' })
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    await this.securityService.requestPasswordReset(dto.email);
    return { message: 'Si le compte existe, un email a été envoyé' };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmer la réinitialisation de mot de passe' })
  @ApiOkResponse({ description: 'Mot de passe réinitialisé avec succès' })
  @ApiBadRequestResponse({ description: 'Token de réinitialisation invalide, expiré ou mot de passe trop faible' })
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    await this.securityService.confirmPasswordReset(dto.token, dto.newPassword);
    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  // --- Preferences ---

  @Get('me/locale')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lire la langue active' })
  @ApiOkResponse({ description: 'Langue active de l\'utilisateur retournée' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getLocale(@Req() req: { user: JwtPayload }) {
    return this.preferencesService.getLocale(req.user.sub);
  }

  @Patch('me/locale')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier la langue active' })
  @ApiOkResponse({ description: 'Langue active mise à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Langue demandée non prise en charge' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async updateLocale(@Req() req: { user: JwtPayload }, @Body() dto: UpdateLocaleDto) {
    return this.preferencesService.updateLocale(req.user.sub, dto.locale);
  }

  @Get('me/notifications/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lire ses préférences de notifications' })
  @ApiOkResponse({ description: 'Préférences de notifications retournées avec succès' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getNotifPrefs(@Req() req: { user: JwtPayload }) {
    return this.preferencesService.getNotificationPreferences(req.user.sub);
  }

  @Patch('me/notifications/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier ses préférences de notifications' })
  @ApiOkResponse({ description: 'Préférences de notifications mises à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Données de préférences invalides' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async updateNotifPrefs(@Req() req: { user: JwtPayload }, @Body() dto: UpdateNotifPrefsDto) {
    return this.preferencesService.updateNotificationPreferences(req.user.sub, dto);
  }

  // --- RGPD Right of Rectification / Restriction / Opposition ---

  @Patch('me/personal-data')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rectifier ses données personnelles' })
  @ApiNoContentResponse({ description: 'Données personnelles rectifiées avec succès' })
  @ApiBadRequestResponse({ description: 'Données fournies ou code TOTP invalides' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async rectifyPersonalData(@Req() req: { user: JwtPayload }, @Body() dto: RectifyDataDto) {
    await this.rgpdService.rectifyPersonalData(req.user.sub, dto);
  }

  @Post('me/data-processing/opt-out')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "S'opposer à un traitement" })
  @ApiOkResponse({ description: 'Droit d\'opposition enregistré avec succès' })
  @ApiBadRequestResponse({ description: 'Type de traitement inconnu ou non modifiable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async addOptOut(@Req() req: { user: JwtPayload }, @Body() dto: OptOutDto) {
    await this.rgpdService.addOptOut(req.user.sub, dto.processingType);
    return { message: 'Opposition enregistrée' };
  }

  @Get('me/data-processing/opt-out')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister ses oppositions' })
  @ApiOkResponse({ description: 'Liste des oppositions actives retournée' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getOptOuts(@Req() req: { user: JwtPayload }) {
    const optOuts = await this.rgpdService.getOptOuts(req.user.sub);
    return { optOuts };
  }

  @Delete('me/data-processing/opt-out')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer une opposition' })
  @ApiNoContentResponse({ description: 'Droit d\'opposition révoqué avec succès (traitement réactivé)' })
  @ApiBadRequestResponse({ description: 'Type de traitement invalide' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async removeOptOut(@Req() req: { user: JwtPayload }, @Body() dto: OptOutDto) {
    await this.rgpdService.removeOptOut(req.user.sub, dto.processingType);
  }

  @Post('me/data-processing/restrict')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activer la limitation du traitement' })
  @ApiOkResponse({ description: 'Limitation du traitement activée (données gelées)' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async restrict(@Req() req: { user: JwtPayload }) {
    await this.rgpdService.activateRestriction(req.user.sub);
    return { message: 'Limitation active' };
  }

  @Delete('me/data-processing/restrict')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver la limitation du traitement' })
  @ApiNoContentResponse({ description: 'Limitation du traitement désactivée' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async unrestrict(@Req() req: { user: JwtPayload }) {
    await this.rgpdService.deactivateRestriction(req.user.sub);
  }

  // --- Discovery / Search ---

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rechercher des utilisateurs' })
  @ApiOkResponse({ description: 'Résultats de la recherche d\'utilisateurs retournés' })
  @ApiBadRequestResponse({ description: 'Paramètres de recherche ou de pagination invalides' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
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
  @ApiOkResponse({ description: 'Liste des profils à découvrir à proximité retournée' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async discover(@Req() req: { user: JwtPayload }, @Query() pagination?: PaginationDto) {
    return this.discoveryService.getDiscoverFeed(req.user.sub, pagination);
  }

  @Get('me/swipes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historique des swipes' })
  @ApiOkResponse({ description: 'Historique complet des swipes effectués retourné' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getSwipes(@Req() req: { user: JwtPayload }, @Query() pagination?: PaginationDto) {
    return this.discoveryService.getSwipeHistory(req.user.sub, pagination);
  }

  @Get('me/blocks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des utilisateurs bloqués' })
  @ApiOkResponse({ description: 'Liste des utilisateurs bloqués par le compte connecté retournée' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getBlocks(@Req() req: { user: JwtPayload }, @Query() pagination?: PaginationDto) {
    return this.socialService.getBlocked(req.user.sub, pagination);
  }

  @Get(':user_id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Consulter le profil d'un tiers" })
  @ApiOkResponse({ description: 'Profil public de l\'utilisateur cible retourné' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getPublicProfile(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    return this.usersService.getPublicProfile(req.user.sub, targetId);
  }

  @Post(':user_id/swipe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Swipe de profil' })
  @ApiOkResponse({ description: 'Swipe enregistré avec succès (avec potentiel Match)' })
  @ApiBadRequestResponse({ description: 'Direction du swipe invalide' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
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
  @ApiOkResponse({ description: 'Abonnement enregistré avec succès' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async follow(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    await this.socialService.follow(req.user.sub, targetId);
    return { message: 'Utilisateur suivi' };
  }

  @Delete(':user_id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ne plus suivre un utilisateur' })
  @ApiNoContentResponse({ description: 'Désabonnement pris en compte avec succès' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async unfollow(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    await this.socialService.unfollow(req.user.sub, targetId);
  }

  @Get(':user_id/followers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des followers' })
  @ApiOkResponse({ description: 'Liste des followers de l\'utilisateur cible retournée' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
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
  @ApiOkResponse({ description: 'Liste des abonnements de l\'utilisateur cible retournée' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
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
  @ApiOkResponse({ description: 'Liste des abonnements mutuels (amis) retournée avec succès' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
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
  @ApiOkResponse({ description: 'Utilisateur bloqué avec succès' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async block(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    await this.socialService.block(req.user.sub, targetId);
    return { message: 'Utilisateur bloqué' };
  }

  @Delete(':user_id/block')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Débloquer un utilisateur' })
  @ApiNoContentResponse({ description: 'Utilisateur débloqué avec succès' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async unblock(@Req() req: { user: JwtPayload }, @Param('user_id') targetId: string) {
    await this.socialService.unblock(req.user.sub, targetId);
  }

  @Post(':user_id/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Signaler un utilisateur' })
  @ApiOkResponse({ description: 'Signalement enregistré et envoyé à la modération' })
  @ApiBadRequestResponse({ description: 'Raison de signalement manquante ou invalide' })
  @ApiNotFoundResponse({ description: 'Utilisateur cible introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async report(
    @Req() req: { user: JwtPayload },
    @Param('user_id') targetId: string,
    @Body() dto: ReportUserDto,
  ) {
    await this.socialService.report(req.user.sub, targetId, dto.reason);
    return { message: 'Signalement enregistré' };
  }
}
