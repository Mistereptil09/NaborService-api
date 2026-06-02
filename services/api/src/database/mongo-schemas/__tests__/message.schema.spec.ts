import * as mongoose from 'mongoose';
import { MessageSchema } from '../schemas/message.schema';
import { createTotalSizePreSaveHook } from '../validators/size-validators';

describe('Message Schema', () => {
  let MessageModel: mongoose.Model<any>;

  beforeAll(() => {
    MessageModel =
      mongoose.models.Message || mongoose.model('Message', MessageSchema);
  });

  it('should have the correct collection name', () => {
    expect(MessageSchema.options.collection).toBe('messages');
  });

  it('should have the correct indexes defined', () => {
    const indexes = MessageSchema.indexes();

    const pgMsgIdx = indexes.find((idx) => idx[0].pg_message_id === 1);
    expect(pgMsgIdx).toBeDefined();
    expect(pgMsgIdx?.[1]?.unique).toBe(true);

    const groupIdx = indexes.find(
      (idx) => idx[0].pg_group_id === 1 && idx[0].sent_at === -1,
    );
    expect(groupIdx).toBeDefined();

    const senderIdx = indexes.find((idx) => idx[0].pg_sender_id === 1);
    expect(senderIdx).toBeDefined();

    const deletedIdx = indexes.find((idx) => idx[0].deleted_at === 1);
    expect(deletedIdx).toBeDefined();
  });

  it('should validate successfully for a valid message', () => {
    const doc = new MessageModel({
      pg_message_id: 'msg_123',
      pg_group_id: 'grp_123',
      pg_sender_id: 'usr_sender',
      content_encrypted: 'encryptedContentString',
      iv: 'ivString',
      auth_tag: 'authTagString',
      type: 'text',
      attachments: [],
      reactions: [
        {
          pg_user_id: 'usr_reacter',
          emoji: '👍',
          reacted_at: new Date(),
        },
      ],
      sent_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('should reject an attachment exceeding 4.5 MB', () => {
    const doc = new MessageModel({
      pg_message_id: 'msg_123',
      pg_group_id: 'grp_123',
      pg_sender_id: 'usr_sender',
      content_encrypted: 'encryptedContentString',
      iv: 'ivString',
      auth_tag: 'authTagString',
      type: 'file',
      attachments: [
        {
          data: Buffer.from('attachment'),
          mimetype: 'application/pdf',
          filename: 'doc.pdf',
          size_bytes: 4718593, // 4.5 MB + 1 byte
          uploaded_at: new Date(),
        },
      ],
      sent_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors['attachments.0.size_bytes']).toBeDefined();
    expect(err?.errors['attachments.0.size_bytes'].message).toBe(
      'size_bytes exceeds maximum of 4718592 bytes for attachment',
    );
  });

  it('should reject attachments array exceeding length 3', () => {
    const attachmentsList = Array.from({ length: 4 }).map((_, i) => ({
      data: Buffer.from('a'),
      mimetype: 'text/plain',
      filename: `file_${i}.txt`,
      size_bytes: 100,
      uploaded_at: new Date(),
    }));

    const doc = new MessageModel({
      pg_message_id: 'msg_123',
      pg_group_id: 'grp_123',
      pg_sender_id: 'usr_sender',
      content_encrypted: 'encryptedContentString',
      iv: 'ivString',
      auth_tag: 'authTagString',
      type: 'file',
      attachments: attachmentsList,
      sent_at: new Date(),
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.attachments).toBeDefined();
    expect(err?.errors.attachments.message).toBe(
      'attachments exceeds maximum length of 3',
    );
  });

  describe('Pre-save hook - aggregate size limit', () => {
    const hook = createTotalSizePreSaveHook({
      binaryFields: [
        { path: 'attachments', isArray: true, sizeField: 'size_bytes' },
      ],
      maxTotalBytes: 14155776, // 13.5 MB
    });

    it('should pass if the total size of attachments is at or below 13.5 MB', () => {
      const mockDoc = {
        get: (path: string) => {
          if (path === 'attachments')
            return [{ size_bytes: 7000000 }, { size_bytes: 7155776 }];
          return null;
        },
      };

      let error: any;
      hook.call(mockDoc, (err: any) => {
        error = err;
      });
      expect(error).toBeUndefined();
    });

    it('should fail if the total size of attachments exceeds 13.5 MB', () => {
      const mockDoc = {
        get: (path: string) => {
          if (path === 'attachments')
            return [{ size_bytes: 7000000 }, { size_bytes: 7155777 }]; // 1 byte over
          return null;
        },
      };

      let error: any;
      hook.call(mockDoc, (err: any) => {
        error = err;
      });
      expect(error).toBeDefined();
      expect(error.errors.total_size.message).toBe(
        'Total binary size (14155777 bytes) exceeds maximum of 14155776 bytes',
      );
    });
  });
});
