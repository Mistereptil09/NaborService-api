import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PointsService } from './points.service';
import { PointsTopupService } from './points-topup.service';
import { PointsConnectService } from './points-connect.service';
import { PointsCashoutService } from './points-cashout.service';
import {
  CreateCashoutDto,
  CreateTopupDto,
  ListLedgerDto,
} from './dto/points-routes.dtos';

@ApiTags('points')
@Controller('points')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PointsController {
  constructor(
    private readonly pointsService: PointsService,
    private readonly pointsTopupService: PointsTopupService,
    private readonly pointsConnectService: PointsConnectService,
    private readonly pointsCashoutService: PointsCashoutService,
  ) {}

  @Get('balance')
  @ApiOperation({ summary: 'Consulter son solde de points' })
  async getBalance(@Req() req: any) {
    const pointsBalance = await this.pointsService.getBalance(req.user.sub);
    return { pointsBalance };
  }

  @Get('ledger')
  @ApiOperation({ summary: 'Consulter son historique de points' })
  async getLedger(@Query() query: ListLedgerDto, @Req() req: any) {
    return this.pointsService.findLedger({
      userId: req.user.sub,
      type: query.type,
      offset: query.offset,
      limit: query.limit,
    });
  }

  @Post('topup')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Créer une session de paiement Stripe pour acheter des points',
  })
  async createTopup(@Body() dto: CreateTopupDto, @Req() req: any) {
    return this.pointsTopupService.createCheckoutSession(
      req.user.sub,
      dto.amountCents,
    );
  }

  @Get('connect/status')
  @ApiOperation({ summary: 'Consulter son éligibilité au retrait (Stripe Connect)' })
  async getConnectStatus(@Req() req: any) {
    return this.pointsConnectService.getStatus(req.user.sub);
  }

  @Post('connect/onboard')
  @ApiOperation({ summary: "Démarrer l'onboarding Stripe Connect pour recevoir des virements" })
  async createOnboardingLink(@Req() req: any) {
    return this.pointsConnectService.createOnboardingLink(req.user.sub);
  }

  @Post('cashout')
  @ApiOperation({ summary: 'Convertir des points en virement bancaire (Stripe Connect)' })
  async createCashout(@Body() dto: CreateCashoutDto, @Req() req: any) {
    return this.pointsCashoutService.createCashout(req.user.sub, dto.amountPoints);
  }
}
