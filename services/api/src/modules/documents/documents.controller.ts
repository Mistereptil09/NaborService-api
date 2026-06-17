import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Types } from 'mongoose';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DocumentsService } from './documents.service';
import { GridFSService } from '../media/services/gridfs.service';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly gridfsService: GridFSService,
  ) {}

  // ── GET /documents/:document_id (signatory) ────────────

  @Get(':document_id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Consulter un document archivé (signataire uniquement)',
    description:
      'Contrat ou reçu. Documents immuables après signature — eIDAS + SHA-256.',
  })
  @ApiOkResponse({ description: 'Document retourné' })
  @ApiForbiddenResponse({
    description: 'Non signataire de ce document',
  })
  @ApiNotFoundResponse({ description: 'Document introuvable' })
  @ApiUnauthorizedResponse({ description: 'Non authentifié' })
  async getDocument(
    @Param('document_id') documentId: string,
    @Req() req: { user: { sub: string } },
  ) {
    return this.documentsService.findById(documentId, req.user.sub);
  }

  // ── GET /documents/:document_id/download (signatory) ───

  @Get(':document_id/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Télécharger le PDF d\'un document (signataire uniquement)',
  })
  @ApiOkResponse({ description: 'PDF streamé' })
  @ApiForbiddenResponse({ description: 'Non signataire' })
  @ApiNotFoundResponse({ description: 'Document introuvable' })
  async downloadDocument(
    @Param('document_id') documentId: string,
    @Req() req: { user: { sub: string } },
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.findById(documentId, req.user.sub);

    res.setHeader('Content-Type', doc.pdf.mimetype);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="document-${documentId}.pdf"`,
    );
    res.setHeader('Content-Length', doc.pdf.size_bytes.toString());

    const stream = this.gridfsService.openDownloadStream(
      new Types.ObjectId(doc.pdf.gridfs_file_id),
    );
    stream.pipe(res);
  }
}

@ApiTags('Admin / Documents')
@Controller('admin/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class AdminDocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly gridfsService: GridFSService,
  ) {}

  @Get(':document_id')
  @ApiOperation({
    summary: 'Accès admin à tout document',
    description: 'Lecture seule — documents immuables après signature (eIDAS + SHA-256)',
  })
  @ApiOkResponse({ description: 'Document retourné' })
  @ApiNotFoundResponse({ description: 'Document introuvable' })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs' })
  async getDocument(@Param('document_id') documentId: string) {
    return this.documentsService.findByIdAdmin(documentId);
  }

  @Get(':document_id/download')
  @ApiOperation({ summary: 'Télécharger le PDF (admin)' })
  async downloadDocument(
    @Param('document_id') documentId: string,
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.findByIdAdmin(documentId);

    res.setHeader('Content-Type', doc.pdf.mimetype);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="document-${documentId}.pdf"`,
    );
    res.setHeader('Content-Length', doc.pdf.size_bytes.toString());

    const stream = this.gridfsService.openDownloadStream(
      new Types.ObjectId(doc.pdf.gridfs_file_id),
    );
    stream.pipe(res);
  }
}
