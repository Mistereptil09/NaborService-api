import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EntityPatchHandler } from '../entity-patch.handler';
import { User } from '../../../users/entities/user.entity';
import { Incident } from '../../../incidents/entities/incident.entity';
import { Listing } from '../../../listings/entities/listing.entity';
import { Evenement } from '../../../events/entities/evenement.entity';
import { SyncUpdateItemDto } from '../../dto/sync-push.dto';

describe('EntityPatchHandler', () => {
  let handler: EntityPatchHandler;
  let userRepository: jest.Mocked<Repository<User>>;

  const mockRepository = () => ({
    findOne: jest.fn(),
    update: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityPatchHandler,
        { provide: getRepositoryToken(User), useFactory: mockRepository },
        { provide: getRepositoryToken(Incident), useFactory: mockRepository },
        { provide: getRepositoryToken(Listing), useFactory: mockRepository },
        { provide: getRepositoryToken(Evenement), useFactory: mockRepository },
      ],
    }).compile();

    handler = module.get<EntityPatchHandler>(EntityPatchHandler);
    userRepository = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should process a valid update by whitelisting fields (User)', async () => {
    const update: SyncUpdateItemDto = {
      entity_type: 'user',
      entity_id: 'user-123',
      changes: {
        firstName: 'John',
        role: 'admin', // Should be ignored
        passwordHash: 'h4ck3d', // Should be ignored
      },
      updated_at: new Date(Date.now() + 1000).toISOString(),
    };

    const existingUser = {
      id: 'user-123',
      firstName: 'Old',
      role: 'resident',
      updatedAt: new Date(Date.now() - 10000),
    };

    userRepository.findOne.mockResolvedValue(existingUser as any);

    const result = await handler.handlePatch(update);

    expect(result.status).toBe('success');
    expect((result as any).processed).toBe(true);
    expect(userRepository.update).toHaveBeenCalledWith('user-123', {
      firstName: 'John',
    });
  });

  it('should return conflict if server data is newer', async () => {
    const update: SyncUpdateItemDto = {
      entity_type: 'user',
      entity_id: 'user-123',
      changes: { firstName: 'Stale' },
      updated_at: new Date(Date.now() - 50000).toISOString(), // Old client
    };

    const existingUser = {
      id: 'user-123',
      firstName: 'New',
      updatedAt: new Date(Date.now() - 10000), // Newer server
    };

    userRepository.findOne.mockResolvedValue(existingUser as any);

    const result = await handler.handlePatch(update);

    expect(result.status).toBe('conflict');
    expect((result as any).conflict).toBeDefined();
    expect((result as any).conflict.entityType).toBe('user');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('should return processed false if all fields are filtered out', async () => {
    const update: SyncUpdateItemDto = {
      entity_type: 'user',
      entity_id: 'user-123',
      changes: {
        passwordHash: 'h4ck3d',
      },
      updated_at: new Date().toISOString(),
    };

    const result = await handler.handlePatch(update);

    expect(result.status).toBe('success');
    expect((result as any).processed).toBe(false);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });
});
