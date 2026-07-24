import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
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
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import type { Request, Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MediaService } from './services/media.service';
import { GridFSService } from './services/gridfs.service';
import { Listing } from '../listings/entities/listing.entity';
import { User } from '../users/entities/user.entity';
import { MessageMetadata } from '../messaging/entities/message-metadata.entity';
import { UsersInGroup } from '../messaging/entities/users-in-group.entity';
import { ListingTransaction } from '../listings/entities/listing-transaction.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Evenement } from '../events/entities/evenement.entity';
import { EventParticipant } from '../events/entities/event-participant.entity';
import { GroupRoleEnum, ParticipantStatusEnum } from '../../common/enums';
import { MediaFileDocument } from './schemas/media-file.schema';
import { ReorderPhotosDto } from './dto/reorder-photos.dto';
import { UpdateCaptionDto } from './dto/update-caption.dto';
import { ChatMessageService } from '../messaging/chat-message.service';
import { ChatGateway } from '../messaging/chat.gateway';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly gridfsService: GridFSService,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MessageMetadata)
    private readonly messageMetadataRepository: Repository<MessageMetadata>,
    @InjectRepository(UsersInGroup)
    private readonly usersInGroupRepository: Repository<UsersInGroup>,
    @InjectRepository(ListingTransaction)
    private readonly listingTransactionRepository: Repository<ListingTransaction>,
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(Evenement)
    private readonly evenementRepository: Repository<Evenement>,
    @InjectRepository(EventParticipant)
    private readonly eventParticipantRepository: Repository<EventParticipant>,
    private readonly chatMessageService: ChatMessageService,
    private readonly chatGateway: ChatGateway,
  ) {}

  private async isMessageGroupMember(
    groupId: string,
    userId: string,
  ): Promise<boolean> {
    const membership = await this.usersInGroupRepository.findOne({
      where: { groupId, userId, leftAt: IsNull(), kickedAt: IsNull() },
    });
    return membership !== null;
  }

  private static readonly PUBLIC_TO_AUTHENTICATED = new Set([
    'user_avatar',
    'user_banner',
    'listing_photo',
    'event_cover',
  ]);

  private isPrivilegedRole(role: string): boolean {
    return role === 'admin' || role === 'moderator';
  }

  private async assertCanReadMedia(
    doc: MediaFileDocument,
    user: JwtPayload,
  ): Promise<void> {
    if (this.isPrivilegedRole(user.role)) {
      return;
    }

    if (MediaController.PUBLIC_TO_AUTHENTICATED.has(doc.owner_type)) {
      return;
    }

    switch (doc.owner_type) {
      case 'event_attachment': {
        const event = await this.evenementRepository.findOne({
          where: { id: doc.owner_id },
        });
        if (!event) {
          throw new NotFoundException('Événement introuvable');
        }
        if (event.creatorId === user.sub) {
          return;
        }
        const participant = await this.eventParticipantRepository.findOne({
          where: {
            eventId: doc.owner_id,
            userId: user.sub,
            status: Not(ParticipantStatusEnum.CANCELLED),
          },
        });
        if (participant) {
          return;
        }
        throw new ForbiddenException('Action non autorisée');
      }
      case 'incident_photo': {
        const incident = await this.incidentRepository.findOne({
          where: { id: doc.owner_id },
        });
        if (!incident) {
          throw new NotFoundException('Signalement introuvable');
        }
        if (
          incident.reporterId === user.sub ||
          incident.assignedTo === user.sub
        ) {
          return;
        }
        throw new ForbiddenException('Action non autorisée');
      }
      case 'message_attachment': {
        const message = await this.messageMetadataRepository.findOne({
          where: { id: doc.owner_id },
        });
        if (!message) {
          throw new NotFoundException('Message introuvable');
        }
        if (await this.isMessageGroupMember(message.groupId, user.sub)) {
          return;
        }
        throw new ForbiddenException('Action non autorisée');
      }
      case 'contract': {
        const transaction = await this.listingTransactionRepository.findOne({
          where: { id: doc.owner_id },
        });
        if (!transaction) {
          throw new NotFoundException('Transaction introuvable');
        }
        if (
          transaction.providerId === user.sub ||
          transaction.requesterId === user.sub
        ) {
          return;
        }
        throw new ForbiddenException('Action non autorisée');
      }
      default:
        throw new ForbiddenException('Action non autorisée');
    }
  }

  @Get(':mediaId/stream')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Streamer ou télécharger un fichier média' })
  @ApiOkResponse({
    description:
      "Flux de données du média (supporte le streaming partiel via l'entête Range)",
  })
  @ApiBadRequestResponse({ description: "Format d'identifiant média invalide" })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  @ApiForbiddenResponse({ description: 'Accès non autorisé à ce média' })
  @ApiNotFoundResponse({
    description: 'Média, ressource associée ou fichier de stockage introuvable',
  })
  async streamMedia(
    @Param('mediaId') mediaId: string,
    @Req() req: Request & { user: JwtPayload },
    @Res() res: Response,
  ) {
    if (!/^[0-9a-fA-F]{24}$/.test(mediaId)) {
      throw new BadRequestException('Invalid media identifier format');
    }

    const metadata = await this.mediaService.findById(mediaId);
    await this.assertCanReadMedia(metadata, req.user);
    const fileId = metadata.gridfs_file_id;

    let fileInfo;
    try {
      fileInfo = await this.gridfsService.getFileInfo(fileId);
    } catch (err) {
      throw new NotFoundException('File not found in storage');
    }

    const totalSize = fileInfo.length;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'max-age=31536000, immutable');
    res.setHeader('Content-Type', metadata.mimetype);

    if (metadata.owner_type === 'contract') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${metadata.original_filename}"`,
      );
    }

    const rangeHeader = req.headers.range;

    if (!rangeHeader) {
      res.setHeader('Content-Length', totalSize.toString());
      res.status(200);
      const downloadStream = this.gridfsService.openDownloadStream(fileId);
      downloadStream.pipe(res);
      return;
    }

    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (
      isNaN(start) ||
      start < 0 ||
      start >= totalSize ||
      end >= totalSize ||
      start > end
    ) {
      res.setHeader('Content-Range', `bytes */${totalSize}`);
      return res.status(416).send('Range Not Satisfiable');
    }

    const chunkSize = end - start + 1;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    res.setHeader('Content-Length', chunkSize.toString());
    res.status(206);

    const downloadStream = this.gridfsService.openDownloadStream(fileId, {
      start,
      end: end + 1,
    });
    downloadStream.pipe(res);
  }

  @Post('listings/:listingId/photos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Téléverser une photo pour une annonce' })
  @ApiCreatedResponse({
    description:
      "Photo téléversée, optimisée en WebP et associée à l'annonce avec succès",
  })
  @ApiBadRequestResponse({
    description:
      'Fichier invalide, trop volumineux, format non supporté, ou limite de photos atteinte (max 8)',
  })
  @ApiForbiddenResponse({
    description: 'Non autorisé à modifier cette annonce ou action interdite',
  })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadListingPhoto(
    @Req() req: { user: JwtPayload },
    @Param('listingId') listingId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException('Annonce introuvable');
    }
    if (
      listing.creatorId !== req.user.sub &&
      req.user.role !== 'admin' &&
      req.user.role !== 'moderator'
    ) {
      throw new ForbiddenException('Action non autorisée');
    }

    return this.mediaService.upload(file, 'listing_photo', listingId);
  }

  @Post('users/:userId/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Téléverser son avatar de profil' })
  @ApiCreatedResponse({
    description: 'Avatar téléversé, optimisé en WebP et mis à jour avec succès',
  })
  @ApiBadRequestResponse({
    description:
      'Fichier invalide, trop volumineux (max 2MB) ou format non supporté',
  })
  @ApiForbiddenResponse({
    description: 'Non autorisé à modifier cet utilisateur',
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadUserAvatar(
    @Req() req: { user: JwtPayload },
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (req.user.sub !== userId) {
      throw new ForbiddenException('Action non autorisée');
    }
    return this.mediaService.upload(file, 'user_avatar', userId);
  }

  @Post('users/:userId/banner')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Téléverser sa bannière de profil' })
  @ApiCreatedResponse({
    description:
      'Bannière téléversée, optimisée en WebP et mise à jour avec succès',
  })
  @ApiBadRequestResponse({
    description:
      'Fichier invalide, trop volumineux (max 4MB) ou format non supporté',
  })
  @ApiForbiddenResponse({
    description: 'Non autorisé à modifier cet utilisateur',
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadUserBanner(
    @Req() req: { user: JwtPayload },
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (req.user.sub !== userId) {
      throw new ForbiddenException('Action non autorisée');
    }
    return this.mediaService.upload(file, 'user_banner', userId);
  }

  @Post('events/:eventId/cover')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: "Téléverser une image de couverture d'événement" })
  @ApiCreatedResponse({
    description:
      "Couverture d'événement téléversée, optimisée en WebP et associée avec succès",
  })
  @ApiBadRequestResponse({
    description:
      'Fichier invalide, trop volumineux (max 5MB) ou format non supporté',
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadEventCover(
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.mediaService.upload(file, 'event_cover', eventId);
  }

  @Post('events/:eventId/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Téléverser une pièce jointe pour un événement' })
  @ApiCreatedResponse({
    description:
      'Pièce jointe téléversée (et potentiellement optimisée/transcodée) et associée avec succès',
  })
  @ApiBadRequestResponse({
    description: 'Fichier invalide, trop volumineux ou format non supporté',
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadEventAttachment(
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.mediaService.upload(file, 'event_attachment', eventId);
  }

  @Post('incidents/:incidentId/photos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: "Téléverser une photo de preuve de signalement d'incident",
  })
  @ApiCreatedResponse({
    description:
      "Photo de preuve d'incident téléversée, optimisée en WebP et associée avec succès",
  })
  @ApiBadRequestResponse({
    description:
      'Fichier invalide, trop volumineux (max 5MB) ou format non supporté',
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadIncidentPhoto(
    @Param('incidentId') incidentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.mediaService.upload(file, 'incident_photo', incidentId);
  }

  @Post('messages/:messageId/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Téléverser une pièce jointe de message' })
  @ApiCreatedResponse({
    description:
      'Pièce jointe de message téléversée (et potentiellement optimisée/transcodée) avec succès',
  })
  @ApiBadRequestResponse({
    description:
      'Fichier invalide, trop volumineux (max 5MB pour images, 50MB autres), format non supporté ou limite atteinte (max 3)',
  })
  @ApiForbiddenResponse({ description: 'Non membre du groupe de ce message' })
  @ApiNotFoundResponse({ description: 'Message introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadMessageAttachment(
    @Req() req: { user: JwtPayload },
    @Param('messageId') messageId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const message = await this.messageMetadataRepository.findOne({
      where: { id: messageId },
    });
    if (!message) {
      throw new NotFoundException('Message introuvable');
    }
    if (!(await this.isMessageGroupMember(message.groupId, req.user.sub))) {
      throw new ForbiddenException('Action non autorisée');
    }
    const uploaded = await this.mediaService.upload(
      file,
      'message_attachment',
      messageId,
    );
    const enrichedMessage = await this.chatMessageService.getMessage(
      messageId,
      req.user.sub,
    );
    this.chatGateway.emitToGroup(
      message.groupId,
      'message:received',
      enrichedMessage,
    );
    return uploaded;
  }

  @Post('contracts/:transactionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Téléverser un PDF de contrat ou reçu' })
  @ApiCreatedResponse({
    description: 'PDF de contrat ou reçu téléversé et enregistré avec succès',
  })
  @ApiBadRequestResponse({
    description:
      'Fichier invalide, trop volumineux, format non PDF, ou doublon de hash SHA-256 détecté',
  })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async uploadContract(
    @Param('transactionId') transactionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.mediaService.upload(file, 'contract', transactionId);
  }

  @Delete(':mediaId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer un fichier média' })
  @ApiOkResponse({
    description: 'Média supprimé avec succès de la base et du stockage GridFS',
  })
  @ApiForbiddenResponse({ description: 'Non autorisé à supprimer ce média' })
  @ApiNotFoundResponse({ description: 'Média introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async deleteMedia(
    @Req() req: { user: JwtPayload },
    @Param('mediaId') mediaId: string,
  ) {
    const doc = await this.mediaService.findById(mediaId);

    if (doc.owner_type === 'user_avatar' || doc.owner_type === 'user_banner') {
      if (doc.owner_id !== req.user.sub) {
        throw new ForbiddenException('Action non autorisée');
      }
    } else if (doc.owner_type === 'listing_photo') {
      const listing = await this.listingRepository.findOne({
        where: { id: doc.owner_id },
      });
      if (!listing) {
        throw new NotFoundException('Annonce introuvable');
      }
      if (
        listing.creatorId !== req.user.sub &&
        req.user.role !== 'admin' &&
        req.user.role !== 'moderator'
      ) {
        throw new ForbiddenException('Action non autorisée');
      }
    } else if (doc.owner_type === 'message_attachment') {
      const message = await this.messageMetadataRepository.findOne({
        where: { id: doc.owner_id },
      });
      if (!message) {
        throw new NotFoundException('Message introuvable');
      }
      if (message.senderId !== req.user.sub) {
        const membership = await this.usersInGroupRepository.findOne({
          where: {
            groupId: message.groupId,
            userId: req.user.sub,
            leftAt: IsNull(),
            kickedAt: IsNull(),
          },
        });
        if (!membership || membership.roleInGroup !== GroupRoleEnum.ADMIN) {
          throw new ForbiddenException('Action non autorisée');
        }
      }
    }

    await this.mediaService.delete(mediaId);
    return { success: true };
  }

  @Patch(':mediaId/caption')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Mettre à jour la légende d'une photo d'annonce" })
  @ApiOkResponse({
    description: "Légende de la photo d'annonce mise à jour avec succès",
  })
  @ApiBadRequestResponse({
    description: "Média n'est pas une photo d'annonce ou légende invalide",
  })
  @ApiForbiddenResponse({
    description: 'Non autorisé à modifier cette annonce',
  })
  @ApiNotFoundResponse({ description: 'Média ou annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async updateCaption(
    @Req() req: { user: JwtPayload },
    @Param('mediaId') mediaId: string,
    @Body() dto: UpdateCaptionDto,
  ) {
    const doc = await this.mediaService.findById(mediaId);
    if (doc.owner_type !== 'listing_photo') {
      throw new BadRequestException("Média n'est pas une photo d'annonce");
    }

    const listing = await this.listingRepository.findOne({
      where: { id: doc.owner_id },
    });
    if (!listing) {
      throw new NotFoundException('Annonce introuvable');
    }
    if (
      listing.creatorId !== req.user.sub &&
      req.user.role !== 'admin' &&
      req.user.role !== 'moderator'
    ) {
      throw new ForbiddenException('Action non autorisée');
    }

    await this.mediaService.updateCaption(mediaId, dto.caption);
    return { success: true };
  }

  @Patch('listings/:listingId/photos/reorder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Réorganiser les photos d'une annonce" })
  @ApiOkResponse({ description: 'Photos réorganisées avec succès' })
  @ApiBadRequestResponse({ description: 'Données de réorganisation invalides' })
  @ApiForbiddenResponse({
    description: 'Non autorisé à modifier cette annonce',
  })
  @ApiNotFoundResponse({ description: 'Annonce introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async reorderPhotos(
    @Req() req: { user: JwtPayload },
    @Param('listingId') listingId: string,
    @Body() dto: ReorderPhotosDto,
  ) {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException('Annonce introuvable');
    }
    if (
      listing.creatorId !== req.user.sub &&
      req.user.role !== 'admin' &&
      req.user.role !== 'moderator'
    ) {
      throw new ForbiddenException('Action non autorisée');
    }

    await this.mediaService.reorderListingPhotos(listingId, dto.mediaIds);
    return { success: true };
  }
}
