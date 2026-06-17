import { Injectable } from '@nestjs/common';
import {
  generatePdf,
  generateContractPdf,
  generateReceiptPdf,
} from '../../common/pdf-generator';

export type DocumentTemplateType =
  | 'listing_contract'
  | 'listing_receipt'
  | 'event_confirmation'
  | 'event_ticket';

export interface ListingContractData {
  title: string;
  providerName: string;
  providerEmail: string;
  requesterName: string;
  requesterEmail: string;
  priceCents: number;
  date: string;
}

export interface ListingReceiptData extends ListingContractData {
  contractRef: string;
}

export interface EventConfirmationData {
  eventTitle: string;
  participantName: string;
  participantEmail: string;
  date: string;
  location?: string;
  ticketId: string;
}

export interface EventTicketData {
  eventTitle: string;
  participantName: string;
  date: string;
  location?: string;
  qrPayload: string;
  ticketId: string;
}

@Injectable()
export class DocumentTemplateService {
  generate(type: 'listing_contract', data: ListingContractData): Buffer;
  generate(type: 'listing_receipt', data: ListingReceiptData): Buffer;
  generate(type: 'event_confirmation', data: EventConfirmationData): Buffer;
  generate(type: 'event_ticket', data: EventTicketData): Buffer;
  generate(type: DocumentTemplateType, data: any): Buffer {
    switch (type) {
      case 'listing_contract':
        return generateContractPdf(data);
      case 'listing_receipt':
        return generateReceiptPdf(data);
      case 'event_confirmation':
        return this.generateEventConfirmation(data);
      case 'event_ticket':
        return this.generateEventTicket(data);
    }
  }

  private generateEventConfirmation(data: EventConfirmationData): Buffer {
    const content = [
      `CONFIRMATION DE PARTICIPATION`,
      ``,
      `Evenement: ${data.eventTitle}`,
      `Date: ${data.date}`,
      `Lieu: ${data.location ?? 'Non specifie'}`,
      ``,
      `Participant:`,
      `  ${data.participantName}`,
      `  ${data.participantEmail}`,
      ``,
      `Reference billet: ${data.ticketId}`,
      ``,
      `Ce document confirme l'inscription a l'evenement.`,
      `Presentation du QR code obligatoire a l'entree.`,
    ].join('\n');
    return generatePdf(content);
  }

  private generateEventTicket(data: EventTicketData): Buffer {
    const content = [
      `BILLET D'EVENEMENT`,
      ``,
      `Evenement: ${data.eventTitle}`,
      `Date: ${data.date}`,
      `Lieu: ${data.location ?? 'Non specifie'}`,
      ``,
      `Participant: ${data.participantName}`,
      `Reference: ${data.ticketId}`,
      ``,
      `QR Code payload: ${data.qrPayload}`,
      ``,
      `Ce billet est strictement personnel.`,
      `Le QR code sera verifie a l'entree par l'organisateur ou le moderateur.`,
    ].join('\n');
    return generatePdf(content);
  }
}
