export function generatePdf(content: string): Buffer {
  const escaped = content
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '')
    .replace(/\n/g, '\n');

  const textObject = `BT /F1 12 Tf 50 750 Td (${escaped}) Tj ET`;

  const pdf = `%PDF-1.4
%âãÏÓ
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R
   /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>
>>
endobj

4 0 obj
<< /Length ${textObject.length + 5} >>
stream
${textObject}
endstream
endobj

xref
0 5
0000000000 65535 f \r
0000000009 00000 n \r
0000000058 00000 n \r
0000000115 00000 n \r
0000000280 00000 n \r
trailer
<< /Size 5 /Root 1 0 R >>
startxref
370
%%EOF`;

  return Buffer.from(pdf.replace(/\r/g, '').split('\n').join('\n'), 'utf-8');
}

export function generateContractPdf(data: {
  title: string;
  providerName: string;
  providerEmail: string;
  requesterName: string;
  requesterEmail: string;
  priceCents: number;
  date: string;
}): Buffer {
  const priceEur = (data.priceCents / 100).toFixed(2);
  const content = [
    `CONTRAT DE PROMESSE DE SERVICE`,
    ``,
    `Date: ${data.date}`,
    ``,
    `Service: ${data.title}`,
    `Montant: ${priceEur} EUR`,
    ``,
    `PRESTATAIRE:`,
    `  ${data.providerName}`,
    `  ${data.providerEmail}`,
    ``,
    `DEMANDEUR:`,
    `  ${data.requesterName}`,
    `  ${data.requesterEmail}`,
    ``,
    `Les parties s'engagent a realiser le service decrit ci-dessus`,
    `conformement aux conditions generales de la plateforme Nabor.`,
    ``,
    `Signatures:`,
    `______________________   ______________________`,
    `Prestataire               Demandeur`,
  ].join('\n');

  return generatePdf(content);
}

export function generateReceiptPdf(data: {
  title: string;
  providerName: string;
  providerEmail: string;
  requesterName: string;
  requesterEmail: string;
  priceCents: number;
  date: string;
  contractRef: string;
}): Buffer {
  const priceEur = (data.priceCents / 100).toFixed(2);
  const content = [
    `RECU DE BONNE EXECUTION`,
    ``,
    `Date de cloture: ${data.date}`,
    `Reference Contrat: ${data.contractRef}`,
    ``,
    `Service: ${data.title}`,
    `Montant regle: ${priceEur} EUR`,
    ``,
    `PRESTATAIRE:`,
    `  ${data.providerName}`,
    `  ${data.providerEmail}`,
    ``,
    `DEMANDEUR:`,
    `  ${data.requesterName}`,
    `  ${data.requesterEmail}`,
    ``,
    `Les parties confirment la bonne execution du service.`,
    ``,
    `Signatures:`,
    `______________________   ______________________`,
    `Prestataire               Demandeur`,
  ].join('\n');

  return generatePdf(content);
}
