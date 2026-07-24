import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import {
  EventTicket,
  EventTicketDocument,
} from '../../database/mongo-schemas/schemas/event-ticket.schema';
import { Evenement } from './entities/evenement.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class EventTicketService {
  constructor(
    @InjectModel(EventTicket.name)
    private readonly ticketModel: Model<EventTicketDocument>,
    @InjectRepository(Evenement)
    private readonly eventRepo: Repository<Evenement>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private generateHmac(
    eventId: string,
    userId: string,
    firstName: string,
    customValue: string | null,
  ): string {
    const secret = process.env.HMAC_SECRET || 'default_dev_secret';
    const payload = `${eventId}:${userId}:${firstName}:${customValue || ''}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  async generateTicket(eventId: string, userId: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const hmac = this.generateHmac(eventId, userId, user.firstName, null);

    const existingTicket = await this.ticketModel.findOne({
      pg_event_id: eventId,
      pg_user_id: userId,
    });
    if (existingTicket) {
      return existingTicket;
    }

    const mockQrPng = Buffer.from('Mock QR Code PNG Data');

    const ticket = new this.ticketModel({
      pg_event_id: eventId,
      pg_user_id: userId,
      qr_payload: {
        event_id: eventId,
        user_id: userId,
        first_name: user.firstName,
        custom_value: null,
        hmac_sha256: hmac,
      },
      qr_png: mockQrPng,
      issued_at: new Date(),
      scanned_at: null,
    });

    await ticket.save();
    return ticket;
  }

  async getTicketStream(eventId: string, userId: string) {
    const ticket = await this.ticketModel.findOne({
      pg_event_id: eventId,
      pg_user_id: userId,
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const pdfBuffer = Buffer.from(
      `%PDF-1.4\nMock PDF Ticket for Event ${eventId} User ${userId}\nHMAC: ${ticket.qr_payload.hmac_sha256}`,
    );
    const stream = new Readable();
    stream.push(pdfBuffer);
    stream.push(null);

    return { stream, sizeBytes: pdfBuffer.length };
  }

  async scanTicket(eventId: string, hmac: string, scannerId: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const ticket = await this.ticketModel.findOne({
      'qr_payload.hmac_sha256': hmac,
      pg_event_id: eventId,
    });
    if (!ticket) {
      throw new BadRequestException('Invalid ticket HMAC');
    }

    if (ticket.scanned_at !== null) {
      throw new ConflictException('Ticket has already been scanned');
    }

    ticket.scanned_at = new Date();
    await ticket.save();

    return {
      success: true,
      scannedAt: ticket.scanned_at,
      user: { id: ticket.pg_user_id, name: ticket.qr_payload.first_name },
    };
  }
}
