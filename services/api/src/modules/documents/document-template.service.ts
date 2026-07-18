import { Injectable } from '@nestjs/common';
import { generatePdf } from '../../common/pdf-generator';
import { PdfBuilder } from '../../common/pdf/pdf-builder';
import { CONTRACT_CLAUSES, resolveTemplateKey } from './contract-clauses';
import { PartySignature } from '../../database/mongo-schemas/schemas/contract.schema';

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
  /** Clé du jeu de clauses (voir contract-clauses.ts). Défaut : 'generic'. */
  templateKey?: string | null;
  categoryName?: string | null;
  neighbourhoodName?: string | null;
}

export interface ListingReceiptData extends ListingContractData {
  contractRef: string;
}

export interface SignedContractEvidence {
  /** SHA-256 du PDF original (non signé), cité par le certificat. */
  originalSha256: string;
  contractId: string;
  transactionId: string;
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

function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  });
}

function priceEur(priceCents: number): string {
  return `${(priceCents / 100).toFixed(2)} EUR`;
}

/**
 * Point d'entrée unique de génération des documents PDF (contrats, reçus,
 * documents d'événement). Les contrats/reçus utilisent pdf-lib avec des
 * clauses par type de service ; la signature électronique simple (eIDAS SES)
 * est matérialisée par renderSignedContract.
 */
@Injectable()
export class DocumentTemplateService {
  resolveTemplateKey(categoryNames: string[]): string {
    return resolveTemplateKey(categoryNames);
  }

  /** Contrat non signé — cadres de signature vides. */
  async renderContract(data: ListingContractData): Promise<Buffer> {
    const builder = await PdfBuilder.create();
    this.buildContractBody(builder, data);
    await builder.signatureBoxes([
      { roleLabel: 'PRESTATAIRE', name: data.providerName },
      { roleLabel: 'DEMANDEUR', name: data.requesterName },
    ]);
    return builder.toBuffer();
  }

  /**
   * Contrat finalisé : signatures dessinées embarquées + page « Certificat de
   * signature » (preuves eIDAS SES).
   */
  async renderSignedContract(
    data: ListingContractData,
    signatures: { provider: PartySignature; requester: PartySignature },
    evidence: SignedContractEvidence,
  ): Promise<Buffer> {
    const builder = await PdfBuilder.create();
    this.buildContractBody(builder, data);
    await builder.signatureBoxes([
      {
        roleLabel: 'PRESTATAIRE',
        name: data.providerName,
        pngDataUrl: signatures.provider.canvas_b64,
        signedAtLabel: `Signé le ${formatDate(signatures.provider.signed_at)}`,
      },
      {
        roleLabel: 'DEMANDEUR',
        name: data.requesterName,
        pngDataUrl: signatures.requester.canvas_b64,
        signedAtLabel: `Signé le ${formatDate(signatures.requester.signed_at)}`,
      },
    ]);

    // Page de preuve
    builder.newPage();
    builder.header(
      'Certificat de signature',
      'Signature électronique simple (eIDAS SES) — plateforme Nabor',
    );
    builder.paragraph(
      'Ce certificat atteste que le document référencé ci-dessous a été signé électroniquement par les deux parties, après vérification de leur identité par code TOTP (authentification à deux facteurs).',
    );
    builder.spacer(6);
    builder.sectionTitle('Document');
    builder.keyValue('Référence contrat', evidence.contractId);
    builder.keyValue('Transaction', evidence.transactionId);
    builder.keyValue('SHA-256 (original)', evidence.originalSha256);
    builder.spacer(6);

    const parties: Array<[string, string, string, PartySignature]> = [
      [
        'Prestataire',
        data.providerName,
        data.providerEmail,
        signatures.provider,
      ],
      [
        'Demandeur',
        data.requesterName,
        data.requesterEmail,
        signatures.requester,
      ],
    ];
    for (const [role, name, email, sig] of parties) {
      builder.sectionTitle(`Signataire — ${role}`);
      builder.keyValue('Nom', name);
      builder.keyValue('Email', email);
      builder.keyValue('Signé le', formatDate(sig.signed_at));
      builder.keyValue('TOTP vérifié le', formatDate(sig.totp_verified_at));
      builder.keyValue('Adresse IP', sig.signed_ip ?? 'Non enregistrée');
      builder.keyValue('Navigateur', sig.user_agent ?? 'Non enregistré');
      builder.spacer(4);
    }

    builder.divider();
    builder.paragraph(
      "L'intégrité du document original est garantie par son empreinte SHA-256, vérifiée au moment de chaque signature. Toute modification du document original invaliderait cette empreinte.",
      { size: 8 },
    );
    return builder.toBuffer();
  }

  /** Reçu de bonne exécution. */
  async renderReceipt(data: ListingReceiptData): Promise<Buffer> {
    const builder = await PdfBuilder.create();
    builder.header(
      'Reçu de bonne exécution',
      data.neighbourhoodName
        ? `Quartier : ${data.neighbourhoodName}`
        : undefined,
    );
    builder.sectionTitle('Prestation');
    builder.keyValue('Service', data.title);
    builder.keyValue('Montant réglé', priceEur(data.priceCents));
    builder.keyValue('Date de clôture', formatDate(data.date));
    builder.keyValue('Référence contrat', data.contractRef);
    builder.spacer(6);
    builder.sectionTitle('Parties');
    builder.keyValue(
      'Prestataire',
      `${data.providerName} — ${data.providerEmail}`,
    );
    builder.keyValue(
      'Demandeur',
      `${data.requesterName} — ${data.requesterEmail}`,
    );
    builder.spacer(6);
    builder.divider();
    builder.paragraph(
      'Les parties confirment la bonne exécution du service décrit ci-dessus. Ce reçu est généré automatiquement par la plateforme Nabor après confirmation mutuelle.',
    );
    return builder.toBuffer();
  }

  private buildContractBody(
    builder: PdfBuilder,
    data: ListingContractData,
  ): void {
    const clauseSet =
      CONTRACT_CLAUSES[data.templateKey ?? 'generic'] ??
      CONTRACT_CLAUSES.generic;

    builder.header(
      clauseSet.titleSuffix
        ? `Contrat de promesse de service — ${clauseSet.titleSuffix}`
        : 'Contrat de promesse de service',
      data.neighbourhoodName
        ? `Quartier : ${data.neighbourhoodName}`
        : undefined,
    );

    builder.sectionTitle('Prestation');
    builder.keyValue('Service', data.title);
    if (data.categoryName) {
      builder.keyValue('Catégorie', data.categoryName);
    }
    builder.keyValue('Montant', priceEur(data.priceCents));
    builder.keyValue('Date du contrat', formatDate(data.date));
    builder.spacer(6);

    builder.sectionTitle('Parties');
    builder.keyValue(
      'Prestataire',
      `${data.providerName} — ${data.providerEmail}`,
    );
    builder.keyValue(
      'Demandeur',
      `${data.requesterName} — ${data.requesterEmail}`,
    );
    builder.spacer(6);

    builder.sectionTitle('Clauses');
    clauseSet.clauses.forEach((clause, i) => {
      builder.paragraph(`${i + 1}. ${clause}`);
    });
    builder.spacer(10);
    builder.sectionTitle('Signatures');
  }

  // ── Documents d'événement (générateur texte historique) ──

  generate(type: 'event_confirmation', data: EventConfirmationData): Buffer;
  generate(type: 'event_ticket', data: EventTicketData): Buffer;
  generate(type: 'event_confirmation' | 'event_ticket', data: any): Buffer {
    switch (type) {
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
