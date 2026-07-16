import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/auth.interfaces';
import { GroupRoleEnum } from '../../common/enums';
import { ChatService } from '../messaging/chat.service';
import { ChatMessageService } from '../messaging/chat-message.service';
import { ChatGateway } from '../messaging/chat.gateway';
import { PollsService } from './polls.service';
import { PollsGateway } from './polls.gateway';
import { CreatePollDto } from './dto/create-poll.dto';
import { UpdatePollDto } from './dto/update-poll.dto';
import { AddOptionDto } from './dto/add-option.dto';
import { VoteDto } from './dto/vote.dto';

const GLOBAL_POLL_CREATOR_ROLES = ['neighbourhood_rep', 'moderator', 'admin'];

@ApiTags('Polls')
@Controller('polls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PollsController {
  constructor(
    private readonly pollsService: PollsService,
    private readonly pollsGateway: PollsGateway,
    private readonly chatService: ChatService,
    private readonly chatMessageService: ChatMessageService,
    private readonly chatGateway: ChatGateway,
  ) {}

  // ── Polls ───────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Sondages d\'un quartier ou d\'un groupe (clôturés inclus, supprimés exclus)' })
  @ApiQuery({ name: 'neighbourhood_id', required: false })
  @ApiQuery({ name: 'group_id', required: false })
  async getPolls(
    @Query('neighbourhood_id') nbId?: string,
    @Query('group_id') groupId?: string,
  ) {
    return this.pollsService.listPolls(nbId, groupId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Créer un sondage — rôle plateforme ≥ neighbourhood_rep (sondage de quartier), ' +
      'ou rôle groupe actions/admin quand group_id est fourni (sondage de conversation)',
  })
  async createPoll(@Req() req: { user: JwtPayload }, @Body() dto: CreatePollDto) {
    if (dto.group_id) {
      await this.chatService.assertGroupRole(dto.group_id, req.user.sub, [
        GroupRoleEnum.ACTIONS,
        GroupRoleEnum.ADMIN,
      ]);
    } else if (!GLOBAL_POLL_CREATOR_ROLES.includes(req.user.role)) {
      throw new ForbiddenException('Action réservée aux modérateurs');
    }

    const poll = await this.pollsService.createPoll(req.user.sub, dto);

    if (dto.group_id) {
      const message = await this.chatMessageService.sendMessage(
        dto.group_id,
        req.user.sub,
        { content: poll.title, type: 'poll', poll_id: poll.id },
      );
      this.chatGateway.emitToGroup(dto.group_id, 'message:received', message);
    } else if (dto.neighbourhood_id) {
      // Bridge into the neighbourhood's own auto-managed conversation, same as
      // group-scoped polls above — otherwise it only ever shows in the Polls tab.
      // Skipped when the group doesn't exist yet (not backfilled) or when the
      // creator isn't a member of it (e.g. a global moderator/admin creating a
      // poll for a neighbourhood they don't belong to) — the poll itself still
      // succeeds either way, there's just no chat entry to post.
      const group = await this.chatService.getNeighbourhoodGroup(
        dto.neighbourhood_id,
      );
      if (group && (await this.chatService.isMember(group.id, req.user.sub))) {
        const message = await this.chatMessageService.sendMessage(
          group.id,
          req.user.sub,
          { content: poll.title, type: 'poll', poll_id: poll.id },
        );
        this.chatGateway.emitToGroup(group.id, 'message:received', message);
      }
    }

    return poll;
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
    return this.pollsService.updatePoll(pollId, req.user.sub, dto, req.user.role);
  }

  @Delete(':poll_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer (créateur)' })
  async deletePoll(@Param('poll_id') pollId: string, @Req() req: { user: JwtPayload }) {
    return this.pollsService.softDeletePoll(pollId, req.user.sub, req.user.role);
  }

  @Post(':poll_id/close')
  @ApiOperation({ summary: 'Clôturer manuellement (créateur)' })
  async closePoll(@Param('poll_id') pollId: string, @Req() req: { user: JwtPayload }) {
    const result = await this.pollsService.closePoll(pollId, req.user.sub, req.user.role);
    const poll = await this.pollsService.getPoll(pollId);
    this.pollsGateway.emitPollClosed(pollId, (poll as any).results);
    return result;
  }

  // ── Options ─────────────────────────────────────────────

  @Post(':poll_id/options')
  @ApiOperation({ summary: 'Ajouter une option (créateur, avant 1er vote)' })
  async addOption(
    @Param('poll_id') pollId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: AddOptionDto,
  ) {
    const option = await this.pollsService.addOption(pollId, req.user.sub, dto.label, req.user.role, dto.weight);
    this.pollsGateway.emitOptionAdded(pollId, { id: option.id, label: option.label, weight: option.weight });
    return option;
  }

  @Delete(':poll_id/options/:option_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer une option sans votes' })
  async deleteOption(
    @Param('poll_id') pollId: string,
    @Param('option_id') optionId: string,
    @Req() req: { user: JwtPayload },
  ) {
    return this.pollsService.deleteOption(pollId, optionId, req.user.sub, req.user.role);
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
    const result = await this.pollsService.vote(pollId, req.user.sub, dto.option_id);
    const poll = await this.pollsService.getPoll(pollId);
    this.pollsGateway.emitPollUpdated(pollId, (poll as any).results);
    return result;
  }

  @Put(':poll_id/vote')
  @ApiOperation({ summary: 'Modifier son vote' })
  async updateVote(
    @Param('poll_id') pollId: string,
    @Req() req: { user: JwtPayload },
    @Body() dto: VoteDto,
  ) {
    const result = await this.pollsService.updateVote(pollId, req.user.sub, dto.option_id);
    const poll = await this.pollsService.getPoll(pollId);
    this.pollsGateway.emitPollUpdated(pollId, (poll as any).results);
    return result;
  }

  @Delete(':poll_id/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer son vote (ou un vote spécifique si option_id fourni)' })
  async deleteVote(
    @Param('poll_id') pollId: string,
    @Req() req: { user: JwtPayload },
    @Body('option_id') optionId?: string,
  ) {
    const result = await this.pollsService.deleteVote(pollId, req.user.sub, optionId);
    const poll = await this.pollsService.getPoll(pollId);
    this.pollsGateway.emitPollUpdated(pollId, (poll as any).results);
    return result;
  }
}
