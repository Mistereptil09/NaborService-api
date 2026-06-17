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
    metadata: {
      findColumnWithPropertyName: jest.fn().mockReturnValue(null),
      columns: [
        { propertyName: 'firstName', databaseName: 'first_name' },
        { propertyName: 'lastName', databaseName: 'last_name' },
      ],
      primaryColumns: [{ databaseName: 'id' }],
    },
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
    // base_updated_at is the entity's updated_at from the last server snapshot
    const serverSnapshotTime = new Date('2025-06-01T10:00:00Z');

    const update: SyncUpdateItemDto = {
      entity_type: 'user',
      entity_id: 'user-123',
      changes: {
        firstName: 'John',
        role: 'admin', // Should be ignored (not in whitelist)
        passwordHash: 'h4ck3d', // Should be ignored (sensitive)
      },
      base_updated_at: serverSnapshotTime.toISOString(),
    };

    const existingUser = {
      id: 'user-123',
      firstName: 'Old',
      role: 'resident',
      // Server hasn't been modified since the snapshot — safe to apply
      updatedAt: new Date('2025-06-01T10:00:00Z'),
    };

    userRepository.findOne.mockResolvedValue(existingUser as any);

    const result = await handler.handlePatch(update);

    expect(result.status).toBe('success');
    expect((result as any).processed).toBe(true);
    expect(userRepository.update).toHaveBeenCalledWith('user-123', {
      firstName: 'John',
    });
  });

  it('should return conflict if server data was modified after the snapshot base version', async () => {
    const serverSnapshotTime = new Date('2025-06-01T10:00:00Z');
    // Server was modified at 11:00, which is AFTER the snapshot base version

    const update: SyncUpdateItemDto = {
      entity_type: 'user',
      entity_id: 'user-123',
      changes: { firstName: 'Stale' },
      base_updated_at: serverSnapshotTime.toISOString(),
    };

    const existingUser = {
      id: 'user-123',
      firstName: 'New',
      // Server was updated more recently than the snapshot base version
      updatedAt: new Date('2025-06-01T11:00:00Z'),
    };

    userRepository.findOne.mockResolvedValue(existingUser as any);

    const result = await handler.handlePatch(update);

    expect(result.status).toBe('conflict');
    expect((result as any).conflict).toBeDefined();
    expect((result as any).conflict.entityType).toBe('user');
    expect((result as any).conflict.fieldName).toBe('firstName');
    expect((result as any).conflict.detectedAt).toBeDefined();
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('should return processed false if all fields are filtered out', async () => {
    const update: SyncUpdateItemDto = {
      entity_type: 'user',
      entity_id: 'user-123',
      changes: {
        passwordHash: 'h4ck3d',
      },
      base_updated_at: new Date().toISOString(),
    };

    const result = await handler.handlePatch(update);

    expect(result.status).toBe('success');
    expect((result as any).processed).toBe(false);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it('should set fieldName to null when multiple fields conflict', async () => {
    const serverSnapshotTime = new Date('2025-06-01T10:00:00Z');

    const update: SyncUpdateItemDto = {
      entity_type: 'user',
      entity_id: 'user-123',
      changes: {
        firstName: 'StaleFirst',
        lastName: 'StaleLast',
      },
      base_updated_at: serverSnapshotTime.toISOString(),
    };

    const existingUser = {
      id: 'user-123',
      firstName: 'NewFirst',
      lastName: 'NewLast',
      updatedAt: new Date('2025-06-01T11:00:00Z'), // server is newer
    };

    userRepository.findOne.mockResolvedValue(existingUser as any);

    const result = await handler.handlePatch(update);

    expect(result.status).toBe('conflict');
    expect((result as any).conflict.fieldName).toBeNull(); // multiple fields
  });

  it('should not flag conflict when server.updatedAt equals base_updated_at', async () => {
    const serverSnapshotTime = new Date('2025-06-01T10:00:00Z');

    const update: SyncUpdateItemDto = {
      entity_type: 'user',
      entity_id: 'user-123',
      changes: { firstName: 'Safe' },
      base_updated_at: serverSnapshotTime.toISOString(),
    };

    const existingUser = {
      id: 'user-123',
      firstName: 'Old',
      // Server timestamp matches the snapshot — no external modification
      updatedAt: new Date('2025-06-01T10:00:00Z'),
    };

    userRepository.findOne.mockResolvedValue(existingUser as any);

    const result = await handler.handlePatch(update);

    expect(result.status).toBe('success');
    expect((result as any).processed).toBe(true);
  });
});
