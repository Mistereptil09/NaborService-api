import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  DocumentsController,
  AdminDocumentsController,
} from '../documents.controller';
import { DocumentsService } from '../documents.service';
import { GridFSService } from '../../media/services/gridfs.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { Readable } from 'stream';

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let adminController: AdminDocumentsController;
  let service: any;
  let gridfsService: any;

  const mockDoc = {
    _id: 'doc-1',
    pg_transaction_id: 'tx-1',
    type: 'contract',
    sha256_hash: 'abc123',
    pdf: {
      gridfs_file_id: 'gf-1',
      mimetype: 'application/pdf',
      size_bytes: 1024,
    },
    parties: {
      provider: {
        pg_user_id: 'user-1',
        full_name: 'Alice',
        email: 'a@test.com',
      },
      requester: {
        pg_user_id: 'user-2',
        full_name: 'Bob',
        email: 'b@test.com',
      },
    },
    listing_snapshot: {
      title: 'Service X',
      price_cents: 5000,
      listing_type: 'offer',
      neighbourhood_name: 'Marais',
    },
    signature: null,
    signed_at: null,
    created_at: new Date(),
  };

  beforeEach(async () => {
    service = {
      findById: jest.fn(),
      findByIdAdmin: jest.fn(),
      findByTransaction: jest.fn(),
    };
    gridfsService = {
      openDownloadStream: jest
        .fn()
        .mockReturnValue(Readable.from(Buffer.from('fake-pdf'))),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController, AdminDocumentsController],
      providers: [
        { provide: DocumentsService, useValue: service },
        { provide: GridFSService, useValue: gridfsService },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(DocumentsController);
    adminController = module.get(AdminDocumentsController);
  });

  it('both controllers should be defined', () => {
    expect(controller).toBeDefined();
    expect(adminController).toBeDefined();
  });

  describe('GET /documents/:document_id', () => {
    it('should return document for signatory', async () => {
      service.findById.mockResolvedValue(mockDoc);

      const result = await controller.getDocument('doc-1', {
        user: { sub: 'user-1' },
      });
      expect(result._id).toBe('doc-1');
      expect(service.findById).toHaveBeenCalledWith('doc-1', 'user-1');
    });

    it('should throw 404 if not found', async () => {
      service.findById.mockRejectedValue(
        new NotFoundException('Document introuvable'),
      );
      await expect(
        controller.getDocument('unknown', { user: { sub: 'user-1' } }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 403 if not a party', async () => {
      service.findById.mockRejectedValue(
        new ForbiddenException('Non signataire'),
      );
      await expect(
        controller.getDocument('doc-1', { user: { sub: 'user-99' } }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /admin/documents/:document_id', () => {
    it('should return document without party check', async () => {
      service.findByIdAdmin.mockResolvedValue(mockDoc);

      const result = await adminController.getDocument('doc-1');
      expect(result._id).toBe('doc-1');
      expect(service.findByIdAdmin).toHaveBeenCalledWith('doc-1');
    });

    it('should throw 404 if not found', async () => {
      service.findByIdAdmin.mockRejectedValue(new NotFoundException());
      await expect(adminController.getDocument('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
