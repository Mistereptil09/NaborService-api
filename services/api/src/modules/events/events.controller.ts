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
  EventUpdateContentDto,
  CancelDto,
  ReportDto,
  ModerateDto,
  ScanTicketDto,
  EventSwipeDto,
  ReportedEventsResponseDto,
  ListEventsResponseDto,
  ListEventModerationActionsResponseDto,
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
  @ApiOkResponse({
    description: 'Liste des évènements signalés retournée avec succès',
    type: ReportedEventsResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Action réservée aux modérateurs et administrateurs',
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getReportedEvents(
    @Query() query: ListEventsDto,
  ): Promise<ReportedEventsResponseDto> {
    return this.reportService.getReportedEvents(query);
  }

  @Get('moderated_actions')
  @Roles('moderator', 'admin')
  @UseGuards(RolesGuard)
  @ApiOperation({
    summary: 'Lister toutes les actions de modération (Modérateur/Admin)',
  })
  @ApiOkResponse({
    description: "Liste de l'historique global de modération retournée",
    type: ListEventModerationActionsResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Action réservée aux modérateurs et administrateurs',
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getAllModerationActions(
    @Query() query: ListEventsDto,
  ): Promise<ListEventModerationActionsResponseDto> {
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
    await this.moderationService.moderate(req.user.sub, id, dto);
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
  @ApiOkResponse({
    description: 'Liste paginée des évènements retournée avec succès',
    type: ListEventsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Paramètres de filtre ou de pagination invalides',
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async listEvents(
    @Query() query: ListEventsDto,
    @Req() req: any,
  ): Promise<ListEventsResponseDto> {
    return this.eventsService.findAll(req.user.sub, query);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un évènement (brouillon)' })
  async createEvent(@Body() dto: CreateEventDto, @Req() req: any) {
    return this.eventsService.create(req.user.sub, dto);
  }

  @Get(':event_id')
  @ApiOperation({ summary: "Consulter les détails d'un évènement" })
  @ApiOkResponse({
    description: "Détails de l'évènement retournés avec succès",
  })
  @ApiNotFoundResponse({ description: 'Évènement introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getEvent(@Param('event_id') id: string) {
    return this.eventsService.findOneWithCover(id);
  }

  @Patch(':event_id')
  @ApiOperation({ summary: 'Modifier un évènement (brouillon ou publié)' })
  async updateEvent(
    @Param('event_id') id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: any,
  ) {
    return this.eventsService.update(req.user.sub, id, dto, req.user.role);
  }

  @Delete(':event_id')
  @ApiOperation({ summary: 'Supprimer un évènement (soft delete)' })
  async deleteEvent(@Param('event_id') id: string, @Req() req: any) {
    await this.eventsService.softDelete(req.user.sub, id, req.user.role);
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
    @Body() dto: EventUpdateContentDto,
    @Req() req: any,
  ) {
    return this.contentService.updateContent(
      req.user.sub,
      id,
      dto,
      req.user.role,
    );
  }

  @Get(':event_id/media')
  @ApiOperation({ summary: "Lister les médias d'un évènement" })
  @ApiOkResponse({ description: "Liste des médias de l'évènement retournée" })
  @ApiNotFoundResponse({ description: 'Évènement introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async listMedia(@Param('event_id') id: string) {
    return this.mediaService.listMedia(id);
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
    return this.mediaService.uploadMedia(req.user.sub, id, file, req.user.role);
  }

  @Get(':event_id/media/:media_id')
  @ApiOperation({
    summary: "Streamer un média d'évènement (cover ou pièce jointe)",
  })
  async streamMedia(
    @Param('event_id') id: string,
    @Param('media_id') mediaId: string,
    @Res() res: any,
  ) {
    const media = await this.mediaService.getMedia(id, mediaId);
    res.setHeader('Content-Type', media.mimetype);
    res.setHeader('Cache-Control', 'max-age=31536000, immutable');
    res.send(media.data);
  }

  @Delete(':event_id/media/:media_id')
  @ApiOperation({ summary: "Supprimer un média d'un évènement" })
  async deleteMedia(
    @Param('event_id') id: string,
    @Param('media_id') mediaId: string,
    @Req() req: any,
  ) {
    return this.mediaService.deleteMedia(
      req.user.sub,
      id,
      mediaId,
      req.user.role,
    );
  }

  // --- Lifecycle & State Machine ---

  @Post(':event_id/publish')
  @ApiOperation({ summary: 'Publier un évènement' })
  async publishEvent(@Param('event_id') id: string, @Req() req: any) {
    return this.stateMachineService.publish(id, req.user.sub, req.user.role);
  }

  @Post(':event_id/open')
  @ApiOperation({ summary: 'Ouvrir un évènement aux inscriptions' })
  async openEvent(@Param('event_id') id: string, @Req() req: any) {
    return this.stateMachineService.open(id, req.user.sub, req.user.role);
  }

  @Post(':event_id/complete')
  @ApiOperation({ summary: 'Marquer un évènement comme terminé' })
  async completeEvent(@Param('event_id') id: string, @Req() req: any) {
    return this.stateMachineService.complete(id, req.user.sub, req.user.role);
  }

  @Post(':event_id/cancel')
  @ApiOperation({ summary: 'Annuler un évènement' })
  async cancelEvent(
    @Param('event_id') id: string,
    @Body() dto: CancelDto,
    @Req() req: any,
  ) {
    return this.stateMachineService.cancel(
      id,
      req.user.sub,
      dto.reason,
      req.user.role,
    );
  }

  // --- Participants & Waitlist ---

  @Post(':event_id/register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "S'inscrire à un évènement (async, 202)" })
  async register(@Param('event_id') id: string, @Req() req: any) {
    return this.eventsService.register(id, req.user.sub);
  }

  @Delete(':event_id/participants/me')
  @ApiOperation({ summary: 'Annuler sa propre inscription à un évènement' })
  async cancelRegistration(@Param('event_id') id: string, @Req() req: any) {
    await this.eventsService.cancelRegistration(id, req.user.sub);
    return { success: true };
  }

  @Get(':event_id/participants')
  @ApiOperation({ summary: 'Lister les participants inscrits' })
  async getParticipants(@Param('event_id') id: string, @Req() req: any) {
    return this.eventsService.getParticipants(id, req.user.sub, req.user.role);
  }

  @Get(':event_id/waitlist')
  @ApiOperation({ summary: "Lister les participants sur liste d'attente" })
  async getWaitlist(@Param('event_id') id: string, @Req() req: any) {
    return this.eventsService.getWaitlist(id, req.user.sub, req.user.role);
  }

  // --- Tickets ---

  @Get(':event_id/ticket')
  @ApiOperation({ summary: 'Télécharger son billet PDF' })
  async downloadTicket(
    @Param('event_id') id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const doc = await this.ticketService.getTicketStream(id, req.user.sub);
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
    return this.ticketService.scanTicket(id, dto.hmac, req.user.sub); // req.user.sub pour le scanner (ownership check peut aussi être fait dans le service)
  }

  // --- Interactions ---

  @Post(':event_id/swipe')
  @ApiOperation({ summary: 'Liker ou disliker un évènement' })
  async swipeEvent(
    @Param('event_id') id: string,
    @Body() dto: EventSwipeDto,
    @Req() req: any,
  ) {
    await this.eventsService.swipe(req.user.sub, id, dto.direction);
    return { success: true };
  }

  @Get(':event_id/chat')
  @ApiOperation({
    summary: "Obtenir le groupe de discussion lié à l'évènement",
  })
  async getChat(@Param('event_id') id: string, @Req() req: any) {
    return this.eventsService.getChatGroup(id, req.user.sub, req.user.role);
  }

  @Post(':event_id/report')
  @ApiOperation({ summary: 'Signaler un évènement' })
  async reportEvent(
    @Param('event_id') id: string,
    @Body() dto: ReportDto,
    @Req() req: any,
  ) {
    await this.reportService.createReport(req.user.sub, id, dto.reason);
    return { success: true };
  }
}
