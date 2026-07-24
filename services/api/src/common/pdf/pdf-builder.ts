import {
  PDFDocument,
  PDFFont,
  PDFPage,
  RGB,
  StandardFonts,
  rgb,
} from 'pdf-lib';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

const NAVY: RGB = rgb(0.06, 0.16, 0.37); // #0F2A5E
const ORANGE: RGB = rgb(0.97, 0.58, 0.12); // #F7931E
const GRAY: RGB = rgb(0.45, 0.45, 0.45);
const BLACK: RGB = rgb(0.1, 0.1, 0.1);

export class PdfBuilder {
  private doc: PDFDocument;
  private font: PDFFont;
  private fontBold: PDFFont;
  private page: PDFPage;
  private y: number;

  private constructor(doc: PDFDocument, font: PDFFont, fontBold: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.fontBold = fontBold;
    this.page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - MARGIN;
  }

  static async create(): Promise<PdfBuilder> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    return new PdfBuilder(doc, font, fontBold);
  }

  private ensureSpace(needed: number): void {
    if (this.y - needed < MARGIN) {
      this.newPage();
    }
  }

  newPage(): void {
    this.page = this.doc.addPage([A4_WIDTH, A4_HEIGHT]);
    this.y = A4_HEIGHT - MARGIN;
  }

  header(title: string, subtitle?: string): void {
    this.page.drawRectangle({
      x: 0,
      y: A4_HEIGHT - 8,
      width: A4_WIDTH,
      height: 8,
      color: ORANGE,
    });
    this.page.drawText('Nabor', {
      x: MARGIN,
      y: this.y - 18,
      size: 22,
      font: this.fontBold,
      color: NAVY,
    });
    this.y -= 44;
    this.page.drawText(title, {
      x: MARGIN,
      y: this.y - 14,
      size: 16,
      font: this.fontBold,
      color: BLACK,
    });
    this.y -= 22;
    if (subtitle) {
      this.page.drawText(subtitle, {
        x: MARGIN,
        y: this.y - 10,
        size: 10,
        font: this.font,
        color: GRAY,
      });
      this.y -= 16;
    }
    this.y -= 10;
    this.divider();
  }

  divider(): void {
    this.ensureSpace(12);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4_WIDTH - MARGIN, y: this.y },
      thickness: 0.7,
      color: rgb(0.85, 0.85, 0.85),
    });
    this.y -= 14;
  }

  sectionTitle(text: string): void {
    this.ensureSpace(30);
    this.y -= 6;
    this.page.drawText(text.toUpperCase(), {
      x: MARGIN,
      y: this.y - 11,
      size: 11,
      font: this.fontBold,
      color: NAVY,
    });
    this.y -= 22;
  }

  private wrap(text: string, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const raw of text.split('\n')) {
      const words = raw.split(' ');
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  paragraph(text: string, opts?: { size?: number; color?: RGB }): void {
    const size = opts?.size ?? 10;
    const lineHeight = size * 1.45;
    const lines = this.wrap(text, size, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - size,
        size,
        font: this.font,
        color: opts?.color ?? BLACK,
      });
      this.y -= lineHeight;
    }
    this.y -= 4;
  }

  keyValue(label: string, value: string): void {
    const size = 10;
    this.ensureSpace(size * 1.6);
    this.page.drawText(label, {
      x: MARGIN,
      y: this.y - size,
      size,
      font: this.fontBold,
      color: BLACK,
    });
    const labelWidth = 150;
    const lines = this.wrap(value, size, CONTENT_WIDTH - labelWidth);
    let first = true;
    for (const line of lines) {
      if (!first) this.ensureSpace(size * 1.5);
      this.page.drawText(line, {
        x: MARGIN + labelWidth,
        y: this.y - size,
        size,
        font: this.font,
        color: BLACK,
      });
      this.y -= size * 1.5;
      first = false;
    }
  }

  spacer(points = 10): void {
    this.y -= points;
  }

  async signatureBoxes(
    boxes: Array<{
      roleLabel: string;
      name: string;
      pngDataUrl?: string | null;
      signedAtLabel?: string | null;
    }>,
  ): Promise<void> {
    const boxWidth = (CONTENT_WIDTH - 20) / 2;
    const boxHeight = 110;
    this.ensureSpace(boxHeight + 30);

    let x = MARGIN;
    for (const box of boxes) {
      const top = this.y;
      this.page.drawRectangle({
        x,
        y: top - boxHeight,
        width: boxWidth,
        height: boxHeight,
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.8,
      });
      this.page.drawText(box.roleLabel, {
        x: x + 10,
        y: top - 16,
        size: 9,
        font: this.fontBold,
        color: NAVY,
      });
      this.page.drawText(box.name, {
        x: x + 10,
        y: top - 30,
        size: 10,
        font: this.font,
        color: BLACK,
      });

      if (box.pngDataUrl) {
        const base64 = box.pngDataUrl.replace(/^data:image\/png;base64,/, '');
        const png = await this.doc.embedPng(Buffer.from(base64, 'base64'));
        const maxW = boxWidth - 20;
        const maxH = 50;
        const scale = Math.min(maxW / png.width, maxH / png.height, 1);
        this.page.drawImage(png, {
          x: x + 10,
          y: top - 38 - png.height * scale,
          width: png.width * scale,
          height: png.height * scale,
        });
      }

      if (box.signedAtLabel) {
        this.page.drawText(box.signedAtLabel, {
          x: x + 10,
          y: top - boxHeight + 8,
          size: 8,
          font: this.font,
          color: GRAY,
        });
      }

      x += boxWidth + 20;
    }
    this.y -= boxHeight + 16;
  }

  async toBuffer(): Promise<Buffer> {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      const label = `Page ${i + 1} / ${pages.length}`;
      const width = this.font.widthOfTextAtSize(label, 8);
      page.drawText(label, {
        x: (A4_WIDTH - width) / 2,
        y: 28,
        size: 8,
        font: this.font,
        color: GRAY,
      });
    });
    const bytes = await this.doc.save();
    return Buffer.from(bytes);
  }
}
