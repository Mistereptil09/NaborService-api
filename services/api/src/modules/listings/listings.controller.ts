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
  ForbiddenException,
  NotFoundException,
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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatGroup } from '../messaging/entities/chat-group.entity';
import { ListingsService } from './listings.service';
import { ListingContentService } from './listing-content.service';
import { ListingMediaService } from './listing-media.service';
import { ListingStateMachineService } from './listing-state-machine.service';
import { ListingTransactionService } from './listing-transaction.service';
import { ListingReportService } from './listing-report.service';
import { ListingModerationService } from './listing-moderation.service';
import { ListingSignatureService } from './listing-signature.service';
import {
  ListListingsDto,
  CreateListingDto,
  UpdateListingDto,
  UpdateContentDto,
  CancelListingDto,
  ReportListingDto,
  ModerateListingDto,
  SignDocumentDto,
} from './dto/listing-routes.dtos';
import { UserRoleEnum } from '../../common/enums';

@ApiTags('Listings')
@Controller('listings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ListingsController {
  constructor(
    private readonly listingsService: ListingsService,
    private readonly contentService: ListingContentService,
    private readonly mediaService: ListingMediaService,
    private readonly stateMachineService: ListingStateMachineService,
    private readonly transactionService: ListingTransactionService,
    private readonly reportService: ListingReportService,
    private readonly moderationService: ListingModerationService,
    private readonly signatureService: ListingSignatureService,
    @InjectRepository(ChatGroup)
    private readonly chatGroupRepository: Repository<ChatGroup>,
  ) {}

  // --- Moderation Routes (Must be declared BEFORE parameter routes to avoid conflict) ---
  
  @Get('reported')
  @ApiOperation({ summary: 'Lister les annonces signalées (Modérateur/Admin)' })
  @ApiOkResponse({ description: 'Liste des annonces signalées retournée avec succès' })
  @ApiForbiddenResponse({ description: 'Action réservée aux modérateurs et administrateurs' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getReportedListings(@Query() query: ListListingsDto, @Req() req: any) {
    if (req.user.role !== UserRoleEnum.MODERATOR && req.user.role !== UserRoleEnum.ADMIN) {
      throw new ForbiddenException('Action réservée aux modérateurs');
    }
    return this.reportService.getReportedListings(query);
  }

  @Get('moderated_actions')
  @ApiOperation({ summary: 'Lister toutes les actions de modération (Modérateur/Admin)' })
  @ApiOkResponse({ description: 'Liste de l\'historique global de modération retournée' })
  @ApiForbiddenResponse({ description: 'Action réservée aux modérateurs et administrateurs' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getAllModerationActions(@Query() query: ListListingsDto, @Req() req: any) {
    if (req.user.role !== UserRoleEnum.MODERATOR && req.user.role !== UserRoleEnum.ADMIN) {
      throw new ForbiddenException('Action réservée aux modérateurs');
    }
    return this.moderationService.getAllModerationActions(query);
  }

  @Post(':listing_id/moderate')
  @ApiOperation({ summary: 'Modérer une annonce (Modérateur/Admin)' })
  @ApiOkResponse({ description: 'Action de modération appliquée avec succès sur l\'annonce' })
  @ApiBadRequestResponse({ description: 'Action ou motif invalide' })
  @ApiForbiddenResponse({ description: 'Action réservée aux modérateurs et administrateurs' })
  @ApiNotFoundResponse({ description: 'Annonce ciblée introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async moderateListing(
    @Param('listing_id') id: string,
    @Body() dto: ModerateListingDto,
    @Req() req: any,
  ) {
    if (req.user.role !== UserRoleEnum.MODERATOR && req.user.role !== UserRoleEnum.ADMIN) {
      throw new ForbiddenException('Action réservée aux modérateurs');
    }
    await this.moderationService.moderate(req.user.id, id, dto);
    return { success: true };
  }

  @Get(':listing_id/moderation')
  @ApiOperation({ summary: 'Consulter l\'historique de modération d\'une annonce (Modérateur/Admin)' })
  @ApiOkResponse({ description: 'Historique complet des actions de modération sur l\'annonce retourné' })
  @ApiForbiddenResponse({ description: 'Action réservée aux modérateurs et administrateurs' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getModerationHistory(@Param('listing_id') id: string, @Req() req: any) {
    if (req.user.role !== UserRoleEnum.MODERATOR && req.user.role !== UserRoleEnum.ADMIN) {
      throw new ForbiddenException('Action réservée aux modérateurs');
    }
    return this.moderationService.getModerationHistory(id);
  }

  // --- Listings CRUD ---

  @Get()
  @ApiOperation({ summary: 'Lister les annonces publiques' })
  @ApiOkResponse({ description: 'Liste paginée des annonces correspondantes retournée avec succès' })
  @ApiBadRequestResponse({ description: 'Paramètres de filtre ou de pagination invalides' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async listListings(@Query() query: ListListingsDto) {
    return this.listingsService.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une annonce' })
  @ApiCreatedResponse({ description: 'Annonce créée avec succès dans la base' })
  @ApiBadRequestResponse({ description: 'Données de création d\'annonce invalides' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async createListing(@Body() dto: CreateListingDto, @Req() req: any) {
    return this.listingsService.create(req.user.id, dto);
  }

  @Get(':listing_id')
  @ApiOperation({ summary: 'Consulter les détails d\'une annonce' })
  @ApiOkResponse({ description: 'Détails de l\'annonce retournés avec succès' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getListing(@Param('listing_id') id: string) {
    return this.listingsService.findOne(id);
  }

  @Patch(':listing_id')
  @ApiOperation({ summary: 'Modifier une annonce' })
  @ApiOkResponse({ description: 'Annonce modifiée et mise à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Données de modification invalides' })
  @ApiForbiddenResponse({ description: 'Action interdite (l\'annonce n\'appartient pas à l\'utilisateur)' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async updateListing(
    @Param('listing_id') id: string,
    @Body() dto: UpdateListingDto,
    @Req() req: any,
  ) {
    return this.listingsService.update(req.user.id, id, dto);
  }

  @Delete(':listing_id')
  @ApiOperation({ summary: 'Supprimer une annonce (soft delete)' })
  @ApiOkResponse({ description: 'Annonce supprimée/désactivée logiquement avec succès' })
  @ApiForbiddenResponse({ description: 'Action interdite' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async deleteListing(@Param('listing_id') id: string, @Req() req: any) {
    const isModerator = req.user.role === UserRoleEnum.MODERATOR || req.user.role === UserRoleEnum.ADMIN;
    await this.listingsService.softDelete(req.user.id, id, isModerator);
    return { success: true };
  }

  // --- Listing Rich Content (MongoDB) ---

  @Get(':listing_id/content')
  @ApiOperation({ summary: 'Lire le contenu enrichi HTML d\'une annonce' })
  @ApiOkResponse({ description: 'Contenu HTML enrichi et tags retournés avec succès' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getContent(@Param('listing_id') id: string) {
    return this.contentService.getContent(id);
  }

  @Patch(':listing_id/content')
  @ApiOperation({ summary: 'Modifier le contenu enrichi HTML d\'une annonce' })
  @ApiOkResponse({ description: 'Contenu HTML enrichi mis à jour avec succès dans MongoDB' })
  @ApiBadRequestResponse({ description: 'Données de contenu ou de tags invalides' })
  @ApiForbiddenResponse({ description: 'Action interdite' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async updateContent(
    @Param('listing_id') id: string,
    @Body() dto: UpdateContentDto,
    @Req() req: any,
  ) {
    return this.contentService.updateContent(req.user.id, id, dto);
  }

  // --- Listing Media (Multipart Upload) ---

  @Post(':listing_id/media')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Téléverser un média pour une annonce' })
  @ApiCreatedResponse({ description: 'Média téléversé, optimisé et lié avec succès à l\'annonce' })
  @ApiBadRequestResponse({ description: 'Fichier absent, trop volumineux ou format non pris en compte' })
  @ApiForbiddenResponse({ description: 'Action interdite' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadMedia(
    @Param('listing_id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.mediaService.uploadMedia(req.user.id, id, file);
  }

  @Delete(':listing_id/media/:media_id')
  @ApiOperation({ summary: 'Supprimer un média d\'une annonce' })
  @ApiOkResponse({ description: 'Média supprimé avec succès de la base' })
  @ApiForbiddenResponse({ description: 'Action interdite' })
  @ApiNotFoundResponse({ description: 'Annonce ou média introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async deleteMedia(
    @Param('listing_id') id: string,
    @Param('media_id') mediaId: string,
    @Req() req: any,
  ) {
    await this.mediaService.deleteMedia(req.user.id, id, mediaId);
    return { success: true };
  }

  // --- Listing Lifecycle & State Machine ---

  @Post(':listing_id/interest')
  @ApiOperation({ summary: 'Exprimer son intérêt pour une annonce' })
  @ApiOkResponse({ description: 'Intérêt enregistré, démarrage de la transaction et notification de l\'auteur' })
  @ApiBadRequestResponse({ description: 'Action impossible (statut de l\'annonce invalide ou l\'auteur ne peut pas swipe lui-même)' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async expressInterest(@Param('listing_id') id: string, @Req() req: any) {
    return this.stateMachineService.expressInterest(id, req.user.id);
  }

  @Post(':listing_id/accept')
  @ApiOperation({ summary: 'Accepter l\'intérêt d\'un utilisateur pour son annonce' })
  @ApiOkResponse({ description: 'Intérêt accepté, transaction passée à l\'état pending/in_progress' })
  @ApiBadRequestResponse({ description: 'Action impossible dans l\'état actuel de l\'annonce' })
  @ApiForbiddenResponse({ description: 'Action interdite (seul l\'auteur peut accepter la transaction)' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async acceptInterest(@Param('listing_id') id: string, @Req() req: any) {
    return this.stateMachineService.acceptInterest(id, req.user.id);
  }

  @Post(':listing_id/confirm')
  @ApiOperation({ summary: 'Confirmer la bonne exécution du service/échange' })
  @ApiOkResponse({ description: 'Exécution validée avec succès, transaction finalisée (fermée)' })
  @ApiBadRequestResponse({ description: 'Action impossible (les deux parties doivent confirmer ou statut invalide)' })
  @ApiForbiddenResponse({ description: 'Action interdite (l\'utilisateur n\'est pas partie prenante de la transaction)' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async confirmExecution(@Param('listing_id') id: string, @Req() req: any) {
    return this.stateMachineService.confirmExecution(id, req.user.id);
  }

  @Post(':listing_id/cancel')
  @ApiOperation({ summary: 'Annuler une annonce ou une transaction en cours' })
  @ApiOkResponse({ description: 'Annulation prise en compte, transaction annulée' })
  @ApiBadRequestResponse({ description: 'Données d\'annulation invalides ou transition d\'état impossible' })
  @ApiForbiddenResponse({ description: 'Action interdite (seuls les acteurs ou un modérateur peuvent annuler)' })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async cancelListing(
    @Param('listing_id') id: string,
    @Body() dto: CancelListingDto,
    @Req() req: any,
  ) {
    return this.stateMachineService.cancel(id, req.user.id, dto.reason);
  }

  // --- Listing Chat Group ---

  @Get(':listing_id/chat')
  @ApiOperation({ summary: 'Obtenir le groupe de discussion lié à l\'annonce' })
  @ApiOkResponse({ description: 'Groupe de messagerie instantanée retourné' })
  @ApiForbiddenResponse({ description: 'Accès interdit (réservé aux parties de la transaction)' })
  @ApiNotFoundResponse({ description: 'Groupe de messagerie introuvable ou transaction inexistante' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getChat(@Param('listing_id') id: string, @Req() req: any) {
    const transaction = await this.transactionService.findByListingId(id);
    await this.transactionService.verifyPartyAccess(req.user.id, transaction);

    const chatGroup = await this.chatGroupRepository.findOne({
      where: { listingId: id, deletedAt: IsNull() },
    });

    if (!chatGroup) {
      throw new NotFoundException('Aucun groupe de messagerie lié à cette annonce');
    }

    return chatGroup;
  }

  // --- Contract and Receipt Documents ---

  @Get(':listing_id/contract')
  @ApiOperation({ summary: 'Télécharger le contrat de transaction généré' })
  @ApiOkResponse({ description: 'Fichier PDF du contrat co-signé ou à signer retourné sous forme de flux' })
  @ApiForbiddenResponse({ description: 'Accès interdit (réservé aux parties prenantes de l\'annonce)' })
  @ApiNotFoundResponse({ description: 'Contrat ou transaction non trouvés' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async downloadContract(
    @Param('listing_id') id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const doc = await this.signatureService.getContractStream(req.user.id, id, 'contract');
    res.setHeader('Content-Type', doc.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="contract_${id}.pdf"`);
    res.setHeader('Content-Length', doc.sizeBytes.toString());
    doc.stream.pipe(res);
  }

  @Get(':listing_id/receipt')
  @ApiOperation({ summary: 'Télécharger le reçu/quittance généré' })
  @ApiOkResponse({ description: 'Fichier PDF du reçu d\'exécution retourné sous forme de flux' })
  @ApiForbiddenResponse({ description: 'Accès interdit (réservé aux parties prenantes de l\'annonce)' })
  @ApiNotFoundResponse({ description: 'Reçu ou transaction non trouvés' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async downloadReceipt(
    @Param('listing_id') id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const doc = await this.signatureService.getContractStream(req.user.id, id, 'receipt');
    res.setHeader('Content-Type', doc.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="receipt_${id}.pdf"`);
    res.setHeader('Content-Length', doc.sizeBytes.toString());
    doc.stream.pipe(res);
  }

  @Post(':listing_id/sign')
  @ApiOperation({ summary: 'Signer électroniquement le document (Contrat ou Reçu)' })
  @ApiOkResponse({ description: 'Document co-signé électroniquement avec succès (MFA confirmée)' })
  @ApiBadRequestResponse({ description: 'Signature Base64 vide, code TOTP invalide ou document déjà signé' })
  @ApiForbiddenResponse({ description: 'Accès interdit' })
  @ApiNotFoundResponse({ description: 'Document associé introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async signDocument(
    @Param('listing_id') id: string,
    @Body() dto: SignDocumentDto,
    @Req() req: any,
  ) {
    const ip = req.ip || req.connection.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;
    return this.signatureService.signDocument(req.user.id, id, dto, ip, userAgent);
  }

  // --- Listing Report ---

  @Post(':listing_id/report')
  @ApiOperation({ summary: 'Signaler une annonce pour contenu abusif/inapproprié' })
  @ApiOkResponse({ description: 'Signalement de l\'annonce enregistré et transmis à la modération' })
  @ApiBadRequestResponse({ description: 'Raison du signalement invalide ou vide' })
  @ApiNotFoundResponse({ description: 'Annonce ciblée introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async reportListing(
    @Param('listing_id') id: string,
    @Body() dto: ReportListingDto,
    @Req() req: any,
  ) {
    await this.reportService.createReport(req.user.id, id, dto.reason);
    return { success: true };
  }
}
