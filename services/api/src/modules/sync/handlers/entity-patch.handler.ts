import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';


import { User } from '../../users/entities/user.entity';
import { Incident } from '../../incidents/entities/incident.entity';
import { Listing } from '../../listings/entities/listing.entity';
import { Evenement } from '../../events/entities/evenement.entity';
import { SyncConflict } from '../entities/sync-conflict.entity';
import { SyncUpdateItemDto } from '../dto/sync-push.dto';

export type PatchResult = 
  | { status: 'success'; processed: boolean }
  | { status: 'conflict'; conflict: Partial<SyncConflict> };

@Injectable()
export class EntityPatchHandler {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Incident) private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(Listing) private readonly listingRepository: Repository<Listing>,
    @InjectRepository(Evenement) private readonly eventRepository: Repository<Evenement>,
  ) {}

  private readonly whitelists = {
    user: ['firstName', 'lastName', 'bio', 'phoneNumber', 'profilePictureUrl'],
    listing: ['title', 'description', 'price', 'status', 'locationName'],
    event: ['title', 'description', 'date', 'locationName', 'status', 'maxParticipants'],
    incident: ['title', 'description', 'status', 'severity']
  };

  async handlePatch(update: SyncUpdateItemDto): Promise<PatchResult> {
    const { entity_type, entity_id, changes, updated_at: clientUpdatedAtStr } = update;
    const clientUpdatedAt = new Date(clientUpdatedAtStr);

    const allowedFields = this.whitelists[entity_type] || [];
    const sanitizedChanges: Record<string, any> = {};
    for (const key of Object.keys(changes)) {
      if (allowedFields.includes(key)) {
        sanitizedChanges[key] = changes[key];
      }
    }

    if (Object.keys(sanitizedChanges).length === 0) {
      return { status: 'success', processed: false }; // Nothing to update
    }


    let repo: Repository<any> | null = null;
    switch (entity_type) {
      case 'user': repo = this.userRepository; break;
      case 'listing': repo = this.listingRepository; break;
      case 'event': repo = this.eventRepository; break;
      case 'incident': repo = this.incidentRepository; break;
    }

    if (!repo) {
      return { status: 'success', processed: false };
    }

    const existing = await repo.findOne({ where: { id: entity_id } });
    if (!existing) {
      return { status: 'success', processed: false }; // Entity not found, ignore
    }

    // Conflict detection
    const serverUpdatedAt = existing.updatedAt || existing.createdAt || new Date(0);
    if (serverUpdatedAt > clientUpdatedAt) {
      return {
        status: 'conflict',
        conflict: {
          entityType: entity_type,
          entityId: entity_id,
          clientData: changes,
          serverData: existing,
        }
      };
    }

    await repo.update(entity_id, sanitizedChanges);
    return { status: 'success', processed: true };
  }
}
