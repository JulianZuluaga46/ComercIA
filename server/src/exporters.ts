/** Exportación de tablas a CSV, Excel (.xlsx) y PDF. */
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface Table {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number | null)[][];
  notes?: string[];
}

export type ExportFormat = 'CSV' | 'Excel' | 'PDF';

export const MIME: Record<ExportFormat, { type: string; ext: string }> = {
  CSV: { type: 'text/csv; charset=utf-8', ext: 'csv' },
  Excel: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  PDF: { type: 'application/pdf', ext: 'pdf' },
};

function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(t: Table): Buffer {
  const lines = [t.headers, ...t.rows].map(r => r.map(csvEscape).join(','));
  // BOM para que Excel abra bien las tildes
  return Buffer.from('﻿' + lines.join('\n'), 'utf8');
}

export async function toXlsx(t: Table): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ComercIA';
  const ws = wb.addWorksheet('Reporte');
  ws.addRow([t.title]).font = { bold: true, size: 14 };
  ws.addRow([t.subtitle]).font = { italic: true, color: { argb: 'FF64748B' } };
  ws.addRow([]);
  const header = ws.addRow(t.headers);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  });
  t.rows.forEach(r => ws.addRow(r.map(v => (v == null ? '' : v))));
  t.headers.forEach((h, i) => {
    const maxLen = Math.max(h.length, ...t.rows.map(r => String(r[i] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(48, Math.max(10, maxLen + 2));
  });
  if (t.notes?.length) {
    ws.addRow([]);
    t.notes.forEach(n => (ws.addRow([n]).font = { italic: true, size: 9 }));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(t: Table): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#0f172a').text(t.title);
    doc.fontSize(9).fillColor('#64748b').text(t.subtitle);
    doc.moveDown(0.8);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const weights = t.headers.map((h, i) =>
      Math.min(30, Math.max(6, h.length, ...t.rows.slice(0, 200).map(r => String(r[i] ?? '').length))),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map(w => (w / total) * width);
    const fontSize = 8;
    const pad = 3;

    const drawRow = (cells: (string | number | null)[], header: boolean, shade: boolean) => {
      doc.fontSize(fontSize).font(header ? 'Helvetica-Bold' : 'Helvetica');
      const heights = cells.map((c, i) =>
        doc.heightOfString(String(c ?? ''), { width: widths[i] - pad * 2 }),
      );
      const h = Math.max(...heights) + pad * 2;
      if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        if (!header) drawRow(t.headers, true, false);
      }
      const y = doc.y;
      if (header || shade) {
        doc.rect(left, y, width, h).fill(header ? '#1e40af' : '#f1f5f9');
      }
      let x = left;
      cells.forEach((c, i) => {
        doc
          .fillColor(header ? '#ffffff' : '#0f172a')
          .text(String(c ?? ''), x + pad, y + pad, { width: widths[i] - pad * 2 });
        x += widths[i];
      });
      doc.x = left;
      doc.y = y + h;
    };

    drawRow(t.headers, true, false);
    t.rows.forEach((r, i) => drawRow(r, false, i % 2 === 1));

    if (t.notes?.length) {
      doc.moveDown();
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#64748b');
      t.notes.forEach(n => doc.text(n, left, doc.y, { width }));
    }
    doc.end();
  });
}

export async function render(t: Table, format: ExportFormat): Promise<Buffer> {
  if (format === 'Excel') return toXlsx(t);
  if (format === 'PDF') return toPdf(t);
  return toCsv(t);
}
