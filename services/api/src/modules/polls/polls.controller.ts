import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/auth.interfaces';
import { PollsService } from './polls.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { UpdatePollDto } from './dto/update-poll.dto';
import { AddOptionDto } from './dto/add-option.dto';
import { VoteDto } from './dto/vote.dto';

@ApiTags('Polls')
@Controller('polls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PollsController {
  constructor(private readonly pollsService: PollsService) {}

  // ── Polls ───────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Sondages actifs du quartier' })
  @ApiQuery({ name: 'neighbourhood_id', required: false })
  async getPolls(@Query('neighbourhood_id') nbId?: string) {
    return this.pollsService.getActivePolls(nbId);
  }

  @Post()
  @Roles('neighbourhood_rep', 'moderator', 'admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Créer un sondage (rôle ≥ neighbourhood_rep)' })
  async createPoll(@Req() req: { user: JwtPayload }, @Body() dto: CreatePollDto) {
    return this.pollsService.createPoll(req.user.sub, dto);
  }

  @Get(':poll_id')
  @ApiOperation({ summary: 'Détail + résultats' })
  async getPoll(@Param('poll_id') pollId: string) {
    return this.pollsService.getPoll(pollId);
  }

  @Patch(':poll_id')
  @ApiOperation({ summary: 'Modifier (créateur, avant 1er vote)' })
  async updatePoll(
    @Param('poll_id') pollId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: UpdatePollDto,
  ) {
    return this.pollsService.updatePoll(pollId, req.user.sub, dto);
  }

  @Delete(':poll_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer (créateur)' })
  async deletePoll(@Param('poll_id') pollId: string, @Req() req: { user: JwtPayload }) {
    return this.pollsService.softDeletePoll(pollId, req.user.sub);
  }

  @Post(':poll_id/close')
  @ApiOperation({ summary: 'Clôturer manuellement (créateur)' })
  async closePoll(@Param('poll_id') pollId: string, @Req() req: { user: JwtPayload }) {
    return this.pollsService.closePoll(pollId, req.user.sub);
  }

  // ── Options ─────────────────────────────────────────────

  @Post(':poll_id/options')
  @ApiOperation({ summary: 'Ajouter une option (créateur, avant 1er vote)' })
  async addOption(
    @Param('poll_id') pollId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: AddOptionDto,
  ) {
    return this.pollsService.addOption(pollId, req.user.sub, dto.label);
  }

  @Delete(':poll_id/options/:option_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer une option sans votes' })
  async deleteOption(
    @Param('poll_id') pollId: string,
    @Param('option_id') optionId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.pollsService.deleteOption(pollId, optionId, req.user.sub);
  }

  // ── Vote ────────────────────────────────────────────────

  @Get(':poll_id/vote')
  @ApiOperation({ summary: 'Consulter son vote' })
  async getMyVote(@Param('poll_id') pollId: string, @Req() req: { user: JwtPayload }) {
    return this.pollsService.getMyVote(pollId, req.user.sub);
  }

  @Post(':poll_id/vote')
  @ApiOperation({ summary: 'Voter' })
  async vote(
    @Param('poll_id') pollId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: VoteDto,
  ) {
    return this.pollsService.vote(pollId, req.user.sub, dto.option_id, dto.weight);
  }

  @Put(':poll_id/vote')
  @ApiOperation({ summary: 'Modifier son vote' })
  async updateVote(
    @Param('poll_id') pollId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: VoteDto,
  ) {
    return this.pollsService.updateVote(pollId, req.user.sub, dto.option_id, dto.weight);
  }

  @Delete(':poll_id/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer son vote' })
  async deleteVote(@Param('poll_id') pollId: string, @Req() req: { user: JwtPayload }) {
    return this.pollsService.deleteVote(pollId, req.user.sub);
  }
}
