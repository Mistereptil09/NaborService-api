import { UploadPipeline } from '../../services/upload-pipeline.service';
import { Types } from 'mongoose';

describe('Feature: gridfs-media-storage, Property: multipart filename re-decoding (latin1 -> utf8)', () => {
  let uploadPipeline: UploadPipeline;
  let mockGridFSService: any;

  beforeEach(() => {
    mockGridFSService = {
      upload: jest.fn().mockResolvedValue(new Types.ObjectId()),
    };
    uploadPipeline = new UploadPipeline(mockGridFSService);
  });

  it("fixes an accented filename mangled by multer/busboy's latin1 decoding", async () => {
    const buffer = Buffer.from('%PDF-1.4');
    const file = {
      buffer,
      size: buffer.length,
      originalname: 'DÃ©claration du 2Ã¨me trimestre 2026.pdf',
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    const context = {
      ownerType: 'contract' as any,
      maxSizeBytes: 2000,
      allowedMimeTypes: ['application/pdf'],
    };

    const result = await uploadPipeline.process(file, context);

    expect(result.originalFilename).toBe(
      'Déclaration du 2ème trimestre 2026.pdf',
    );
    expect(mockGridFSService.upload).toHaveBeenCalledWith(
      buffer,
      'Déclaration du 2ème trimestre 2026.pdf',
      'application/pdf',
    );
  });

  it('leaves a plain ASCII filename unchanged', async () => {
    const buffer = Buffer.from('%PDF-1.4');
    const file = {
      buffer,
      size: buffer.length,
      originalname: 'contract.pdf',
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    const context = {
      ownerType: 'contract' as any,
      maxSizeBytes: 2000,
      allowedMimeTypes: ['application/pdf'],
    };

    const result = await uploadPipeline.process(file, context);

    expect(result.originalFilename).toBe('contract.pdf');
  });
});
