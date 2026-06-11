import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import * as Express from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { RateLimit } from './decorators/rate-limit.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TotpConfirmDto } from './dto/totp-confirm.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import { SsoService } from './sso.service';
import { UserSecurityService } from './user-security.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly totpService: TotpService,
    private readonly ssoService: SsoService,
    private readonly userSecurityService: UserSecurityService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un compte' })
  @ApiCreatedResponse({ description: 'Compte créé avec succès' })
  @ApiBadRequestResponse({
    description: 'Données invalides ou email déjà utilisé',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit('login', 10, 900) // 10 requests per 15 mins per IP
  @ApiOperation({ summary: 'Se connecter et obtenir un JWT' })
  @ApiOkResponse({
    description:
      'Connexion réussie (renvoie le token access_token ou un challenge TOTP)',
  })
  @ApiUnauthorizedResponse({ description: 'Email ou mot de passe incorrect' })
  @ApiBadRequestResponse({ description: "Données d'entrée invalides" })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Express.Request,
    @Res({ passthrough: true }) res: Express.Response,
  ) {
    const ip = req.ip || this.getIpAddress(req);
    const userAgent = req.headers['user-agent'] || null;

    const result = await this.authService.login(dto, ip, userAgent);
    return result;
  }

  @Post('totp/confirm-setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirmer la configuration TOTP obligatoire et activer la session',
  })
  @ApiOkResponse({
    description: 'TOTP configuré avec succès, session démarrée',
  })
  @ApiUnauthorizedResponse({
    description: 'Code TOTP ou token de setup invalide/expiré',
  })
  @ApiBadRequestResponse({
    description: 'Données de validation invalides',
  })
  async confirmSetup(
    @Body() dto: TotpVerifyDto, // Reuse the same DTO since it has challenge_token and code
    @Req() req: Express.Request,
    @Res({ passthrough: true }) res: Express.Response,
  ) {
    const ip = req.ip || this.getIpAddress(req);
    const userAgent = req.headers['user-agent'] || null;

    const userId = await this.totpService.verifySetupChallenge(
      dto.challenge_token,
      dto.code,
    );

    const user = await this.userRepository.findOneOrFail({
      where: { id: userId },
    });

    // Generate tokens
    const accessToken = this.tokenService.generateAccessToken(user);
    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Save session in PostgreSQL
    const session = await this.sessionService.createSession({
      userId: user.id,
      refreshTokenHash,
      deviceName: null,
      ipAddress: ip,
      userAgent,
      expiresAt,
    });

    // Save refresh token in Redis
    await this.tokenService.storeRefreshInRedis(
      refreshTokenHash,
      user.id,
      session.id,
      expiresAt,
    );

    // Update user last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    // Set refresh token cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/v1/auth/refresh',
      maxAge: 2592000 * 1000, // 30 days
    });

    return { access_token: accessToken };
  }

  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier le code TOTP et activer la session' })
  @ApiOkResponse({
    description: 'Code TOTP validé avec succès, session démarrée',
  })
  @ApiUnauthorizedResponse({
    description: 'Code TOTP ou token de challenge invalide/expiré',
  })
  @ApiBadRequestResponse({ description: 'Données de validation invalides' })
  async verifyTotp(
    @Body() dto: TotpVerifyDto,
    @Req() req: Express.Request,
    @Res({ passthrough: true }) res: Express.Response,
  ) {
    const ip = req.ip || this.getIpAddress(req);
    const userAgent = req.headers['user-agent'] || null;

    const userId = await this.totpService.verifyChallenge(
      dto.challenge_token,
      dto.code,
    );

    const user = await this.userRepository.findOneOrFail({
      where: { id: userId },
    });

    // Generate tokens
    const accessToken = this.tokenService.generateAccessToken(user);
    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Save session in PostgreSQL
    const session = await this.sessionService.createSession({
      userId: user.id,
      refreshTokenHash,
      deviceName: null,
      ipAddress: ip,
      userAgent,
      expiresAt,
    });

    // Save refresh token in Redis
    await this.tokenService.storeRefreshInRedis(
      refreshTokenHash,
      user.id,
      session.id,
      expiresAt,
    );

    // Update user last login
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    // Set refresh token cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/v1/auth/refresh',
      maxAge: 2592000 * 1000, // 30 days
    });

    return { access_token: accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit('refresh', 10, 60) // 10 requests per 1 min per user_id
  @ApiOperation({
    summary: 'Renouveler le token access_token',
    description:
      'Envoie le refresh_token via cookie (navigateur) OU header Authorization: Bearer <refresh_token> (client lourd Java). Retourne toujours les deux tokens dans le corps JSON.',
  })
  @ApiOkResponse({ description: 'Tokens rafraîchis avec succès' })
  @ApiUnauthorizedResponse({
    description: 'Non authentifié, session expirée ou révoquée',
  })
  async refresh(
    @Req() req: Express.Request,
    @Res({ passthrough: true }) res: Express.Response,
  ) {
    // Extract refresh token from cookie (browser) OR Authorization header (Java desktop)
    let token = req.cookies?.['refresh_token'];
    const viaHeader = !token;
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }
    if (!token) {
      throw new UnauthorizedException('Non authentifié');
    }

    const hash = this.tokenService.hashRefreshToken(token);
    const payload = await this.tokenService.lookupRefreshInRedis(hash);
    const session = await this.sessionService.findByTokenHash(hash);

    const tokenPreview = token.slice(0, 8) + '...' + token.slice(-4);
    this.logger.debug(
      `[refresh] source=${viaHeader ? 'header' : 'cookie'} ` +
      `token=${tokenPreview} sessionId=${session?.id ?? 'none'} ` +
      `userId=${payload?.user_id ?? session?.userId ?? 'unknown'}`,
    );

    // Fallback validation against DB if Redis miss
    if (!payload && session) {
      if (
        session.revokedAt !== null ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('Session expirée ou révoquée');
      }
    }

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Session expirée ou révoquée');
    }

    const user = await this.userRepository.findOne({
      where: { id: session.userId },
    });

    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    // Generate new tokens (Rotation)
    const newAccessToken = this.tokenService.generateAccessToken(user);
    const newRefreshToken = this.tokenService.generateRefreshToken();
    const newHash = this.tokenService.hashRefreshToken(newRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Remove old hash from Redis
    await this.tokenService.deleteRefreshFromRedis(hash);

    // Store new hash in Redis
    await this.tokenService.storeRefreshInRedis(
      newHash,
      user.id,
      session.id,
      expiresAt,
    );

    // Update session in PostgreSQL
    await this.sessionService.updateLastUsed(session.id, newHash);

    // Set cookie for browser-based clients
    if (!viaHeader) {
      res.cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/v1/auth/refresh',
        maxAge: 2592000 * 1000,
      });
    }

    this.logger.debug(
      `[refresh] issued userId=${user.id} sessionId=${session.id} ` +
      `access=${newAccessToken.slice(0, 12)}... ` +
      `refresh=${newRefreshToken.slice(0, 8)}... ` +
      `via=${viaHeader ? 'header' : 'cookie'} expires=${expiresAt.toISOString()}`,
    );

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Se déconnecter' })
  @ApiOkResponse({ description: 'Déconnexion réussie' })
  @ApiUnauthorizedResponse({
    description: 'Non authentifié ou session invalide',
  })
  async logout(
    @Req() req: Express.Request,
    @Res({ passthrough: true }) res: Express.Response,
  ) {
    const token = req.cookies?.['refresh_token'];
    if (!token) {
      throw new UnauthorizedException('Non authentifié');
    }

    const hash = this.tokenService.hashRefreshToken(token);
    const session = await this.sessionService.findByTokenHash(hash);

    if (!session) {
      throw new UnauthorizedException('Session introuvable');
    }

    // Revoke session in Redis and PostgreSQL
    await this.tokenService.deleteRefreshFromRedis(hash);
    await this.sessionService.revokeSession(session.id);

    // Clear cookie
    res.clearCookie('refresh_token', {
      path: '/v1/auth/refresh',
    });

    return { message: 'Déconnecté avec succès' };
  }

  @Post('logout/all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Se déconnecter de tous les appareils' })
  @ApiOkResponse({ description: 'Déconnexion globale réussie' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async logoutAll(@Req() req: { user: { sub: string } }) {
    const activeSessions = await this.sessionService.findActiveByUser(
      req.user.sub,
    );

    // Revoke all in Redis
    for (const session of activeSessions) {
      await this.tokenService.deleteRefreshFromRedis(session.refreshTokenHash);
    }

    // Revoke all in PostgreSQL
    await this.sessionService.revokeAllUserSessions(req.user.sub);

    return { message: 'Déconnecté de tous les appareils' };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les sessions actives' })
  @ApiOkResponse({ description: 'Liste des sessions actives retournée' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getSessions(@Req() req: Express.Request & { user: { sub: string } }) {
    const activeSessions = await this.sessionService.findActiveByUser(
      req.user.sub,
    );
    const token = req.cookies?.['refresh_token'];
    const currentHash = token
      ? this.tokenService.hashRefreshToken(token)
      : null;

    return activeSessions.map((session) => ({
      id: session.id,
      device_name: session.deviceName,
      ip_address: session.ipAddress,
      created_at: session.createdAt,
      last_used_at: session.lastUsedAt,
      is_current:
        currentHash !== null && session.refreshTokenHash === currentHash,
    }));
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Révoquer une session spécifique' })
  @ApiOkResponse({ description: 'Session révoquée avec succès' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  @ApiForbiddenResponse({
    description: "Accès interdit (la session n'appartient pas à l'utilisateur)",
  })
  @ApiNotFoundResponse({ description: 'Session introuvable' })
  async deleteSession(
    @Param('id') sessionId: string,
    @Req() req: { user: { sub: string } },
  ) {
    const dbSession = await this.sessionService.findSessionById(sessionId);

    if (!dbSession) {
      throw new NotFoundException('Session introuvable');
    }

    if (dbSession.userId !== req.user.sub) {
      throw new ForbiddenException('Accès interdit');
    }

    // Revoke in Redis
    await this.tokenService.deleteRefreshFromRedis(dbSession.refreshTokenHash);

    // Revoke in PostgreSQL
    await this.sessionService.revokeSession(dbSession.id);

    return { message: 'Session révoquée' };
  }

  @Post('totp/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Générer un secret TOTP (MFA) pour setup' })
  @ApiOkResponse({ description: 'Secret TOTP et QR Code générés avec succès' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async setupTotp(@Req() req: Express.Request & { user: { sub: string } }) {
    const user = await this.userRepository.findOneOrFail({
      where: { id: req.user.sub },
    });
    return this.totpService.setupTotp(user.id, user.email);
  }

  @Post('totp/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirmer le code TOTP et activer la MFA' })
  @ApiOkResponse({ description: 'TOTP configuré et activé avec succès' })
  @ApiBadRequestResponse({ description: 'Code TOTP fourni invalide' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async confirmTotp(
    @Req() req: { user: { sub: string } },
    @Body() dto: TotpConfirmDto,
  ) {
    await this.totpService.confirmTotp(req.user.sub, dto.code);
    return { message: 'TOTP activé' };
  }

  @Post('totp/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Désactiver la MFA (TOTP)' })
  @ApiOkResponse({ description: 'TOTP désactivé avec succès' })
  @ApiBadRequestResponse({ description: 'Code TOTP fourni invalide' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async disableTotp(
    @Req() req: { user: { sub: string } },
    @Body() dto: TotpConfirmDto,
  ) {
    await this.totpService.disableTotp(req.user.sub, dto.code);
    return { message: 'TOTP désactivé' };
  }

  @Post('sso/qr/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Générer un QR Code SSO pour Java Desktop' })
  @ApiOkResponse({ description: 'QR Code généré avec succès' })
  @ApiBadRequestResponse({ description: 'Trop de requêtes' })
  async generateSsoQr(@Req() req: Express.Request) {
    const ip = req.ip || this.getIpAddress(req);
    const { qr, scanUrl } = await this.ssoService.generateQr(ip);
    return { qr_code: qr, scan_url: scanUrl };
  }

  @Post('sso/qr/validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valider un QR Code SSO' })
  @ApiOkResponse({ description: 'Session SSO validée avec succès' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  @ApiNotFoundResponse({ description: 'Session SSO introuvable ou expirée' })
  async validateSsoQr(
    @Req() req: Express.Request & { user: { sub: string } },
    @Body('token_uuid') tokenUuid: string,
  ) {
    const userAgent = req.headers['user-agent'] || null;
    await this.ssoService.validateQr(tokenUuid, req.user.sub, userAgent);
    return { message: 'Session SSO validée' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @RateLimit('forgot-password', 5, 900)
  @ApiOperation({ summary: 'Demander une réinitialisation de mot de passe' })
  @ApiOkResponse({
    description: 'Email de réinitialisation envoyé si le compte existe',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.userSecurityService.forgotPassword(dto.email);
    return { message: 'Si un compte existe, un email a été envoyé' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe' })
  @ApiOkResponse({ description: 'Mot de passe réinitialisé avec succès' })
  @ApiBadRequestResponse({ description: 'Token invalide ou expiré' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.userSecurityService.resetPassword(dto.token, dto.password);
    return { message: 'Mot de passe réinitialisé' };
  }

  @Get('sso/qr/:token_uuid/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Vérifier le statut d'une session SSO" })
  @ApiOkResponse({ description: 'Statut de la session SSO' })
  async checkSsoStatus(@Param('token_uuid') tokenUuid: string) {
    return this.ssoService.checkStatus(tokenUuid);
  }

  private getIpAddress(request: Express.Request): string {
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (xForwardedFor && typeof xForwardedFor === 'string') {
      return xForwardedFor.split(',')[0].trim();
    }
    return request.socket?.remoteAddress || '127.0.0.1';
  }
}
