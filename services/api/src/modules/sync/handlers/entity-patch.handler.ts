import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Incident } from '../../incidents/entities/incident.entity';
import { Listing } from '../../listings/entities/listing.entity';
import { Evenement } from '../../events/entities/evenement.entity';
import { SyncConflict } from '../entities/sync-conflict.entity';
import { SyncUpdateItemDto } from '../dto/sync-push.dto';
import { IncidentStatusEnum } from '../../../common/enums';

export type PatchResult =
  | { status: 'success'; processed: boolean; serverEntityId?: string }
  | { status: 'conflict'; conflict: Partial<SyncConflict> }
  | { status: 'skipped'; reason: string };

@Injectable()
export class EntityPatchHandler {
  private readonly logger = new Logger(EntityPatchHandler.name);

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(Evenement)
    private readonly eventRepository: Repository<Evenement>,
  ) {}

  // ── Whitelist & config ──────────────────────────────────

  private readonly whitelists = {
    user: ['firstName', 'lastName', 'bio'],
    listing: ['title', 'description', 'price', 'status', 'locationName'],
    event: [
      'title',
      'description',
      'date',
      'locationName',
      'status',
      'maxParticipants',
    ],
    incident: ['title', 'description', 'status', 'severity'],
  };

  private readonly createDeleteTypes = new Set(['incident']);

  static readonly SENSITIVE_FIELDS: Record<string, string[]> = {
    user: [
      'passwordHash',
      'totpSecret',
      'stripeAccountId',
      'passwordChangedAt',
      'lastLoginAt',
      'isSuspended',
      'suspendedAt',
    ],
    listing: [],
    event: [],
    incident: [],
    listing_transactions: ['paymentFailedReason'],
    event_participants: [],
  };

  getWhitelists(): Record<string, string[]> {
    return this.whitelists;
  }

  // ── Dispatch ────────────────────────────────────────────

  async handlePatch(update: SyncUpdateItemDto): Promise<PatchResult> {
    const repo = this.resolveRepo(update.entity_type);
    if (!repo) {
      return { status: 'success', processed: false };
    }

    switch (update.action ?? 'update') {
      case 'create':
        return this.handleCreate(repo, update);
      case 'delete':
        return this.handleDelete(repo, update);
      default:
        return this.handleUpdate(repo, update);
    }
  }

  // ── CREATE — incidents only ─────────────────────────────

  private async handleCreate(
    repo: Repository<any>,
    { entity_type, changes }: SyncUpdateItemDto,
  ): Promise<PatchResult> {
    if (!this.createDeleteTypes.has(entity_type)) {
      return {
        status: 'skipped',
        reason: `Create not supported for "${entity_type}"`,
      };
    }

    if (!changes.title || typeof changes.title !== 'string') {
      return { status: 'skipped', reason: 'Missing required field "title"' };
    }
    if (!changes.reporterId) {
      return {
        status: 'skipped',
        reason: 'Missing required field "reporterId"',
      };
    }

    const saved = await repo.save(
      repo.create({
        title: changes.title,
        description: changes.description ?? null,
        severity: changes.severity ?? 'medium',
        status: changes.status ?? IncidentStatusEnum.OPEN,
        reporterId: changes.reporterId,
        neighbourhoodId: changes.neighbourhoodId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    return { status: 'success', processed: true, serverEntityId: saved.id };
  }

  // ── DELETE — incidents only ─────────────────────────────

  private async handleDelete(
    repo: Repository<any>,
    { entity_type, entity_id, base_updated_at }: SyncUpdateItemDto,
  ): Promise<PatchResult> {
    if (!this.createDeleteTypes.has(entity_type)) {
      return {
        status: 'skipped',
        reason: `Delete not supported for "${entity_type}"`,
      };
    }

    const existing = await repo.findOne({ where: { id: entity_id } });
    if (!existing) {
      return { status: 'success', processed: false };
    }

    // Only check conflict if the entity was modified on the server.
    if (base_updated_at !== undefined && existing.updatedAt) {
      const clientBase =
        base_updated_at !== null ? new Date(base_updated_at) : new Date(0);
      if (existing.updatedAt.getTime() > clientBase.getTime()) {
        return {
          status: 'conflict',
          conflict: {
            entityType: entity_type,
            entityId: entity_id,
            fieldName: null,
            clientData: { action: 'delete' },
            serverData: this.cleanServerData(entity_type, existing),
            detectedAt: new Date(),
          },
        };
      }
    }

    await repo.delete(entity_id);
    return { status: 'success', processed: true };
  }

  // ── UPDATE ──────────────────────────────────────────────

  private async handleUpdate(
    repo: Repository<any>,
    { entity_type, entity_id, changes, base_updated_at }: SyncUpdateItemDto,
  ): Promise<PatchResult> {
    if (base_updated_at === undefined) {
      return { status: 'success', processed: false };
    }

    const clientBase =
      base_updated_at !== null ? new Date(base_updated_at) : new Date(0);

    // Whitelist filter
    const allowedFields = this.whitelists[entity_type] ?? [];
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(changes)) {
      if (allowedFields.includes(key)) {
        sanitized[key] = changes[key];
      }
    }
    if (Object.keys(sanitized).length === 0) {
      return { status: 'success', processed: false };
    }

    const existing = await repo.findOne({ where: { id: entity_id } });
    if (!existing) {
      return { status: 'success', processed: false };
    }

    // Conflict detection — only if the entity was modified server-side
    if (existing.updatedAt) {
      if (existing.updatedAt.getTime() > clientBase.getTime()) {
        const conflictedFields = Object.keys(sanitized).filter(
          (f) => existing[f] !== undefined,
        );
        return {
          status: 'conflict',
          conflict: {
            entityType: entity_type,
            entityId: entity_id,
            fieldName:
              conflictedFields.length === 1 ? conflictedFields[0] : null,
            clientData: changes,
            serverData: this.cleanServerData(entity_type, existing),
            detectedAt: new Date(),
          },
        };
      }
    }

    // Guard against phantom columns (whitelist entries without a DB column)
    const existingColumns = new Set(
      repo.metadata.columns.map((c) => c.propertyName),
    );
    const validChanges: Record<string, any> = {};
    for (const key of Object.keys(sanitized)) {
      if (existingColumns.has(key)) {
        validChanges[key] = sanitized[key];
      }
    }
    if (Object.keys(validChanges).length === 0) {
      return { status: 'success', processed: false };
    }

    // repo.update() bypasses @UpdateDateColumn — set explicitly
    if (repo.metadata.findColumnWithPropertyName('updatedAt')) {
      validChanges['updatedAt'] = new Date();
    }

    await repo.update(entity_id, validChanges);
    return { status: 'success', processed: true };
  }

  // ── Helpers ─────────────────────────────────────────────

  private resolveRepo(type: string): Repository<any> | null {
    switch (type) {
      case 'user':
        return this.userRepository;
      case 'listing':
        return this.listingRepository;
      case 'event':
        return this.eventRepository;
      case 'incident':
        return this.incidentRepository;
      default:
        return null;
    }
  }

  private cleanServerData(entityType: string, entity: any): any {
    const stripped = EntityPatchHandler.SENSITIVE_FIELDS[entityType] ?? [];
    if (stripped.length === 0) return entity;
    return JSON.parse(
      JSON.stringify(entity, (key, value) =>
        stripped.includes(key) ? undefined : value,
      ),
    );
  }
}
