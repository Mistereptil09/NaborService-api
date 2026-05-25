import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Créer un compte' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Se connecter et obtenir un JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('totp/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Générer un secret TOTP (MFA)' })
  enableTotp(@Request() req: { user: { sub: string } }) {
    return this.authService.enableTotp(req.user.sub);
  }

  @Post('totp/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier le code TOTP et activer le MFA' })
  verifyTotp(
    @Request() req: { user: { sub: string } },
    @Body() body: { code: string },
  ) {
    return this.authService.verifyTotp(req.user.sub, body.code);
  }

  @Post('desktop-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Générer un token SSO pour l'app Java" })
  desktopToken(@Request() req: { user: { sub: string } }) {
    return this.authService.generateDesktopToken(req.user.sub);
  }
}
