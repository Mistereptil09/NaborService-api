import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EventsService } from './events.service';
import { EventContentService } from './event-content.service';
import { EventMediaService } from './event-media.service';
import { EventStateMachineService } from './event-state-machine.service';
import { EventTicketService } from './event-ticket.service';
import { EventReportService } from './event-report.service';
import { EventModerationService } from './event-moderation.service';
import {
  ListEventsDto,
  CreateEventDto,
  UpdateEventDto,
  UpdateContentDto,
  CancelDto,
  ReportDto,
  ModerateDto,
  ScanTicketDto,
  SwipeDto,
} from './dto/event-routes.dtos';
import { UserRoleEnum } from '../../common/enums';

@ApiTags('Events')
@Controller('events')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly contentService: EventContentService,
    private readonly mediaService: EventMediaService,
    private readonly stateMachineService: EventStateMachineService,
    private readonly ticketService: EventTicketService,
    private readonly reportService: EventReportService,
    private readonly moderationService: EventModerationService,
  ) {}

  // --- Moderation Routes ---

  @Get('reported')
  @Roles('moderator', 'admin')
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Lister les évènements signalés (Modérateur/Admin)',
  })
  async getReportedEvents(@Query() query: ListEventsDto) {
    return this.reportService.getReportedEvents(query);
  }

  @Get('moderated_actions')
  @Roles('moderator', 'admin')
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Lister toutes les actions de modération (Modérateur/Admin)',
  })
  async getAllModerationActions(@Query() query: ListEventsDto) {
    return this.moderationService.getAllModerationActions(query);
  }

  @Post(':event_id/moderate')
  @Roles('moderator', 'admin')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Modérer un évènement (Modérateur/Admin)' })
  async moderateEvent(
    @Param('event_id') id: string,
    @Body() dto: ModerateDto,
    @Req() req: any,
  ) {
    await this.moderationService.moderate(req.user.id, id, dto);
    return { success: true };
  }

  @Get(':event_id/moderation')
  @Roles('moderator', 'admin')
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary:
      "Consulter l'historique de modération d'un évènement (Modérateur/Admin)",
  })
  async getModerationHistory(@Param('event_id') id: string) {
    return this.moderationService.getModerationHistory(id);
  }

  // --- Core CRUD ---

  @Get()
  @ApiOperation({ summary: 'Lister les évènements' })
  async listEvents(@Query() query: ListEventsDto, @Req() req: any) {
    return this.eventsService.findAll(req.user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un évènement (brouillon)' })
  async createEvent(@Body() dto: CreateEventDto, @Req() req: any) {
    return this.eventsService.create(req.user.id, dto);
  }

  @Get(':event_id')
  @ApiOperation({ summary: "Consulter les détails d'un évènement" })
  async getEvent(@Param('event_id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':event_id')
  @ApiOperation({ summary: 'Modifier un évènement (brouillon ou publié)' })
  async updateEvent(
    @Param('event_id') id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: any,
  ) {
    return this.eventsService.update(req.user.id, id, dto);
  }

  @Delete(':event_id')
  @ApiOperation({ summary: 'Supprimer un évènement (soft delete)' })
  async deleteEvent(@Param('event_id') id: string, @Req() req: any) {
    const isModerator =
      req.user.role === UserRoleEnum.MODERATOR ||
      req.user.role === UserRoleEnum.ADMIN;
    await this.eventsService.softDelete(req.user.id, id, isModerator);
    return { success: true };
  }

  // --- Content & Media (MongoDB) ---

  @Get(':event_id/content')
  @ApiOperation({ summary: "Lire le contenu enrichi HTML d'un évènement" })
  async getContent(@Param('event_id') id: string) {
    return this.contentService.getContent(id);
  }

  @Patch(':event_id/content')
  @ApiOperation({ summary: "Modifier le contenu enrichi HTML d'un évènement" })
  async updateContent(
    @Param('event_id') id: string,
    @Body() dto: UpdateContentDto,
    @Req() req: any,
  ) {
    return this.contentService.updateContent(req.user.id, id, dto);
  }

  @Post(':event_id/media')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Téléverser un média pour un évènement' })
  async uploadMedia(
    @Param('event_id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.mediaService.uploadMedia(req.user.id, id, file);
  }

  @Delete(':event_id/media/:media_id')
  @ApiOperation({ summary: "Supprimer un média d'un évènement" })
  async deleteMedia(
    @Param('event_id') id: string,
    @Param('media_id') mediaId: string,
    @Req() req: any,
  ) {
    await this.mediaService.deleteMedia(req.user.id, id, mediaId);
    return { success: true };
  }

  // --- Lifecycle & State Machine ---

  @Post(':event_id/publish')
  @ApiOperation({ summary: 'Publier un évènement' })
  async publishEvent(@Param('event_id') id: string, @Req() req: any) {
    return this.stateMachineService.publish(id, req.user.id);
  }

  @Post(':event_id/open')
  @ApiOperation({ summary: 'Ouvrir un évènement aux inscriptions' })
  async openEvent(@Param('event_id') id: string, @Req() req: any) {
    return this.stateMachineService.open(id, req.user.id);
  }

  @Post(':event_id/complete')
  @ApiOperation({ summary: 'Marquer un évènement comme terminé' })
  async completeEvent(@Param('event_id') id: string, @Req() req: any) {
    return this.stateMachineService.complete(id, req.user.id);
  }

  @Post(':event_id/cancel')
  @ApiOperation({ summary: 'Annuler un évènement' })
  async cancelEvent(
    @Param('event_id') id: string,
    @Body() dto: CancelDto,
    @Req() req: any,
  ) {
    return this.stateMachineService.cancel(id, req.user.id, dto.reason);
  }

  // --- Participants & Waitlist ---

  @Post(':event_id/register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "S'inscrire à un évènement (async, 202)" })
  async register(@Param('event_id') id: string, @Req() req: any) {
    return this.eventsService.register(id, req.user.id);
  }

  @Delete(':event_id/participants/me')
  @ApiOperation({ summary: 'Annuler sa propre inscription à un évènement' })
  async cancelRegistration(@Param('event_id') id: string, @Req() req: any) {
    await this.eventsService.cancelRegistration(id, req.user.id);
    return { success: true };
  }

  @Get(':event_id/participants')
  @ApiOperation({ summary: 'Lister les participants inscrits' })
  async getParticipants(@Param('event_id') id: string, @Req() req: any) {
    return this.eventsService.getParticipants(id, req.user.id);
  }

  @Get(':event_id/waitlist')
  @ApiOperation({ summary: "Lister les participants sur liste d'attente" })
  async getWaitlist(@Param('event_id') id: string, @Req() req: any) {
    return this.eventsService.getWaitlist(id, req.user.id);
  }

  // --- Tickets ---

  @Get(':event_id/ticket')
  @ApiOperation({ summary: 'Télécharger son billet PDF' })
  async downloadTicket(
    @Param('event_id') id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const doc = await this.ticketService.getTicketStream(id, req.user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ticket_${id}.pdf"`,
    );
    doc.stream.pipe(res);
  }

  @Post(':event_id/scan-ticket')
  @Roles('moderator', 'admin') // Ou organisateur, mais le spec dit Moderator/Admin pour cette route (requirements 6.7)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Scanner et vérifier un billet' })
  async scanTicket(
    @Param('event_id') id: string,
    @Body() dto: ScanTicketDto,
    @Req() req: any,
  ) {
    return this.ticketService.scanTicket(id, dto.hmac, req.user.id); // req.user.id pour le scanner (ownership check peut aussi être fait dans le service)
  }

  // --- Interactions ---

  @Post(':event_id/swipe')
  @ApiOperation({ summary: 'Liker ou disliker un évènement' })
  async swipeEvent(
    @Param('event_id') id: string,
    @Body() dto: SwipeDto,
    @Req() req: any,
  ) {
    await this.eventsService.swipe(req.user.id, id, dto.direction);
    return { success: true };
  }

  @Get(':event_id/chat')
  @ApiOperation({
    summary: "Obtenir le groupe de discussion lié à l'évènement",
  })
  async getChat(@Param('event_id') id: string, @Req() req: any) {
    return this.eventsService.getChatGroup(id, req.user.id);
  }

  @Post(':event_id/report')
  @ApiOperation({ summary: 'Signaler un évènement' })
  async reportEvent(
    @Param('event_id') id: string,
    @Body() dto: ReportDto,
    @Req() req: any,
  ) {
    await this.reportService.createReport(req.user.id, id, dto.reason);
    return { success: true };
  }
}
