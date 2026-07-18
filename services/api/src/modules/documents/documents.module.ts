import { Module } from '@nestjs/common';
import { MongoSchemasModule } from '../../database/mongo-schemas';
import { MediaModule } from '../media/media.module';
import {
  DocumentsController,
  AdminDocumentsController,
} from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentTemplateService } from './document-template.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MongoSchemasModule, MediaModule, AuthModule],
  controllers: [DocumentsController, AdminDocumentsController],
  providers: [DocumentsService, DocumentTemplateService],
  exports: [DocumentsService, DocumentTemplateService],
})
export class DocumentsModule {}
