import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CallsService } from './calls.service';
import { InitiateCallDto } from './dto/initiate-call.dto';

@ApiTags('Calls')
@Controller('calls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post()
  @ApiOperation({
    summary: 'Démarrer un appel audio/vidéo dans une conversation',
  })
  async initiate(@Req() req: any, @Body() dto: InitiateCallDto) {
    return this.callsService.initiateCall(req.user.sub, dto);
  }

  @Get('ice-servers')
  @ApiOperation({ summary: 'Récupérer les serveurs STUN/TURN (Cloudflare)' })
  async iceServers() {
    return this.callsService.getIceServers();
  }

  @Get(':call_id')
  @ApiOperation({ summary: "État d'un appel (en cours ou historique)" })
  async getCall(@Param('call_id') callId: string, @Req() req: any) {
    return this.callsService.getCallState(callId, req.user.sub);
  }

  @Post(':call_id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Terminer l'appel pour tous les participants" })
  async end(@Param('call_id') callId: string, @Req() req: any) {
    return this.callsService.endCallPrivileged(callId, req.user.sub);
  }
}
