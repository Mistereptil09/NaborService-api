import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { CryptoRotationWorker } from '../crypto-rotation.worker';
import { Message } from '../../../database/mongo-schemas/schemas/message.schema';

describe('CryptoRotationWorker', () => {
  let worker: CryptoRotationWorker;
  const mockMessageModel = {
    find: jest.fn(),
    bulkWrite: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('localhost'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoRotationWorker,
        { provide: getModelToken(Message.name), useValue: mockMessageModel },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    worker = module.get<CryptoRotationWorker>(CryptoRotationWorker);
    
    (worker as any).redis = {
      set: jest.fn(),
    };
    
    jest.clearAllMocks();
  });

  it('should process batch and update messages', async () => {
    mockMessageModel.find.mockResolvedValue([
      { pg_message_id: 'msg-1', content_encrypted: 'old_content_1' },
      { pg_message_id: 'msg-2', content_encrypted: 'old_content_2' },
    ]);
    
    const job = {
      data: {
        pgGroupId: 'group-1',
        newKeyReference: 'key-v2',
        messageIds: ['msg-1', 'msg-2'],
      }
    } as any;
    
    await worker.process(job);
    
    expect(mockMessageModel.find).toHaveBeenCalledWith({
      pg_message_id: { $in: ['msg-1', 'msg-2'] },
      pg_group_id: 'group-1',
    });
    
    expect(mockMessageModel.bulkWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          updateOne: expect.objectContaining({
            filter: { pg_message_id: 'msg-1' },
            update: expect.objectContaining({
              $set: expect.objectContaining({
                content_encrypted: expect.stringContaining('re-encrypted-with-key-v2-old_content_1'),
              })
            })
          })
        }),
      ])
    );
    
    expect((worker as any).redis.set).toHaveBeenCalledWith(
      'group_key_rotation:group-1', 'in-progress', 'EX', 3600
    );
  });
});
