import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EventDocument,
  EventDocumentDocument,
} from '../../database/mongo-schemas/schemas/event-document.schema';
import { Evenement } from './entities/evenement.entity';
import { UpdateContentDto } from './dto/event-routes.dtos';

@Injectable()
export class EventContentService {
  constructor(
    @InjectModel(EventDocument.name)
    private readonly eventDocumentModel: Model<EventDocumentDocument>,
    @InjectRepository(Evenement)
    private readonly eventRepo: Repository<Evenement>,
  ) {}

  async getContent(eventId: string) {
    // We check if event exists in pg
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    let document = await this.eventDocumentModel
      .findOne({ pg_event_id: eventId })
      .lean();
    if (!document) {
      // Create empty document
      const newDoc = new this.eventDocumentModel({
        pg_event_id: eventId,
        body_html: '',
        cover: null,
        programme: [],
        location: { address: null, geocode: null },
        attachments: [],
        created_at: new Date(),
        updated_at: new Date(),
        anonymised_at: null,
      });
      document = await newDoc.save();
    }

    return {
      body_html: document.body_html,
      programme: document.programme,
      location: document.location,
      cover: document.cover
        ? {
            mimetype: document.cover.mimetype,
            size_bytes: document.cover.size_bytes,
          }
        : null,
      attachments: document.attachments.map((a) => ({
        name: a.name,
        mimetype: a.mimetype,
        size_bytes: a.size_bytes,
        uploaded_at: a.uploaded_at,
      })),
    };
  }

  async updateContent(userId: string, eventId: string, dto: UpdateContentDto) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.creatorId !== userId) {
      throw new ForbiddenException('Only the owner can update the content');
    }

    let document = await this.eventDocumentModel.findOne({
      pg_event_id: eventId,
    });
    if (!document) {
      document = new this.eventDocumentModel({
        pg_event_id: eventId,
        body_html: '',
        cover: null,
        programme: [],
        location: { address: null, geocode: null },
        attachments: [],
        created_at: new Date(),
      });
    }

    if (dto.body_html !== undefined) {
      document.body_html = dto.body_html;
    }
    if (dto.programme !== undefined) {
      document.programme = dto.programme;
    }
    if (dto.location !== undefined) {
      document.location = {
        address: dto.location.address ?? null,
        geocode: dto.location.geocode ?? null,
      };
    }

    document.updated_at = new Date();
    await document.save();

    return { success: true };
  }
}
