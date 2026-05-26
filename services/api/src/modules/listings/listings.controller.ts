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

@Controller('listings')
@UseGuards(JwtAuthGuard)
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
  async getReportedListings(@Query() query: ListListingsDto, @Req() req: any) {
    if (req.user.role !== UserRoleEnum.MODERATOR && req.user.role !== UserRoleEnum.ADMIN) {
      throw new ForbiddenException('Action réservée aux modérateurs');
    }
    return this.reportService.getReportedListings(query);
  }

  @Get('moderated_actions')
  async getAllModerationActions(@Query() query: ListListingsDto, @Req() req: any) {
    if (req.user.role !== UserRoleEnum.MODERATOR && req.user.role !== UserRoleEnum.ADMIN) {
      throw new ForbiddenException('Action réservée aux modérateurs');
    }
    return this.moderationService.getAllModerationActions(query);
  }

  @Post(':listing_id/moderate')
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
  async getModerationHistory(@Param('listing_id') id: string, @Req() req: any) {
    if (req.user.role !== UserRoleEnum.MODERATOR && req.user.role !== UserRoleEnum.ADMIN) {
      throw new ForbiddenException('Action réservée aux modérateurs');
    }
    return this.moderationService.getModerationHistory(id);
  }

  // --- Listings CRUD ---

  @Get()
  async listListings(@Query() query: ListListingsDto) {
    return this.listingsService.list(query);
  }

  @Post()
  async createListing(@Body() dto: CreateListingDto, @Req() req: any) {
    return this.listingsService.create(req.user.id, dto);
  }

  @Get(':listing_id')
  async getListing(@Param('listing_id') id: string) {
    return this.listingsService.findOne(id);
  }

  @Patch(':listing_id')
  async updateListing(
    @Param('listing_id') id: string,
    @Body() dto: UpdateListingDto,
    @Req() req: any,
  ) {
    return this.listingsService.update(req.user.id, id, dto);
  }

  @Delete(':listing_id')
  async deleteListing(@Param('listing_id') id: string, @Req() req: any) {
    const isModerator = req.user.role === UserRoleEnum.MODERATOR || req.user.role === UserRoleEnum.ADMIN;
    await this.listingsService.softDelete(req.user.id, id, isModerator);
    return { success: true };
  }

  // --- Listing Rich Content (MongoDB) ---

  @Get(':listing_id/content')
  async getContent(@Param('listing_id') id: string) {
    return this.contentService.getContent(id);
  }

  @Patch(':listing_id/content')
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
  async uploadMedia(
    @Param('listing_id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.mediaService.uploadMedia(req.user.id, id, file);
  }

  @Delete(':listing_id/media/:media_id')
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
  async expressInterest(@Param('listing_id') id: string, @Req() req: any) {
    return this.stateMachineService.expressInterest(id, req.user.id);
  }

  @Post(':listing_id/accept')
  async acceptInterest(@Param('listing_id') id: string, @Req() req: any) {
    return this.stateMachineService.acceptInterest(id, req.user.id);
  }

  @Post(':listing_id/confirm')
  async confirmExecution(@Param('listing_id') id: string, @Req() req: any) {
    return this.stateMachineService.confirmExecution(id, req.user.id);
  }

  @Post(':listing_id/cancel')
  async cancelListing(
    @Param('listing_id') id: string,
    @Body() dto: CancelListingDto,
    @Req() req: any,
  ) {
    return this.stateMachineService.cancel(id, req.user.id, dto.reason);
  }

  // --- Listing Chat Group ---

  @Get(':listing_id/chat')
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
  async downloadContract(
    @Param('listing_id') id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const doc = await this.signatureService.getContract(req.user.id, id, 'contract');
    res.setHeader('Content-Type', doc.pdf.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="contract_${id}.pdf"`);
    res.setHeader('Content-Length', doc.pdf.size_bytes.toString());
    res.send(doc.pdf.data);
  }

  @Get(':listing_id/receipt')
  async downloadReceipt(
    @Param('listing_id') id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const doc = await this.signatureService.getContract(req.user.id, id, 'receipt');
    res.setHeader('Content-Type', doc.pdf.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="receipt_${id}.pdf"`);
    res.setHeader('Content-Length', doc.pdf.size_bytes.toString());
    res.send(doc.pdf.data);
  }

  @Post(':listing_id/sign')
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
  async reportListing(
    @Param('listing_id') id: string,
    @Body() dto: ReportListingDto,
    @Req() req: any,
  ) {
    await this.reportService.createReport(req.user.id, id, dto.reason);
    return { success: true };
  }
}
