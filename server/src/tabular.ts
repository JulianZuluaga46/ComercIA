/** Lectura de archivos CSV / Excel de registros históricos con validación por fila. */
import ExcelJS from 'exceljs';
import { formatDate, isValidDateStr } from './dates.js';

export interface ParsedRow {
  line: number;
  date: string;
  clients: number;
  promotion: boolean | null;
  estimated: boolean;
  observations: string | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: { line: number; message: string }[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  // Separador: el que más aparece en las primeras líneas (la primera puede ser un título sin separadores).
  // Excel en español guarda los CSV con punto y coma.
  const head = clean.split(/\r?\n/, 10).join('\n');
  const delim = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

async function parseXlsx(base64: string): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, r => {
    const values: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      values.push(cellText(r.getCell(c).value));
    }
    rows.push(values);
  });
  return rows;
}

/** Valor de una celda de Excel como texto: fechas, fórmulas, enlaces y texto con formato (negrita parcial, etc.). */
function cellText(v: unknown): string {
  if (v == null) return '';
  // Excel guarda fechas sin zona; exceljs las entrega en UTC.
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return ((v as { richText: { text: string }[] }).richText ?? []).map(t => t.text).join('');
    if ('result' in v) return cellText((v as { result: unknown }).result);
    if ('text' in v) return cellText((v as { text: unknown }).text);
    if ('error' in v) return '';
  }
  return String(v);
}

/** Excel cuenta los días desde el 30/12/1899; una fecha en una celda con formato "General" llega como ese número. */
function excelSerialToDate(n: number): string | null {
  if (!Number.isInteger(n) || n < 20000 || n > 80000) return null; // entre 1954 y 2119
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Fila del encabezado: la primera (de las 10 primeras) que tenga "Fecha" y "Clientes", por si hay un título arriba. */
function findHeader(table: string[][]): number {
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const h = table[i].map(norm);
    if (h.some(c => c.startsWith('fecha')) && h.some(c => c.includes('cliente'))) return i;
  }
  return 0;
}

function parseDateCell(raw: string): string | null {
  const s = raw.trim();
  if (isValidDateStr(s as unknown)) return s;
  if (/^\d{5}$/.test(s)) return excelSerialToDate(Number(s));
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isValidDateStr(iso) ? iso : null;
  }
  return null;
}

function parseBool(raw: string | undefined): boolean | null {
  if (raw == null) return null;
  const v = norm(raw);
  if (!v) return null;
  if (['1', 'si', 's', 'true', 'x'].includes(v)) return true;
  if (['0', 'no', 'n', 'false'].includes(v)) return false;
  return null;
}

export async function parseUpload(input: { csv?: string; fileBase64?: string; filename?: string }): Promise<ParseResult> {
  const isXlsx = input.fileBase64 && /\.xlsx$/i.test(input.filename || '');
  let table: string[][];
  try {
    table = isXlsx ? await parseXlsx(input.fileBase64!) : parseCsv(input.csv ?? Buffer.from(input.fileBase64 || '', 'base64').toString('utf8'));
  } catch {
    return { rows: [], errors: [{ line: 0, message: 'No se pudo leer el archivo. Verifique que sea CSV o Excel (.xlsx) válido.' }] };
  }
  const headerRow = findHeader(table);
  if (table.length - headerRow < 2) {
    return { rows: [], errors: [{ line: 0, message: 'El archivo debe tener encabezado y al menos una fila de datos.' }] };
  }
  const header = table[headerRow].map(norm);
  const idx = (pred: (h: string) => boolean) => header.findIndex(pred);
  const dateIdx = idx(h => h.startsWith('fecha'));
  const clientsIdx = idx(h => h.includes('cliente'));
  const promoIdx = idx(h => h.startsWith('promo'));
  const estIdx = idx(h => h.startsWith('estimad'));
  const obsIdx = idx(h => h.startsWith('observ') || h.startsWith('nota'));
  if (dateIdx < 0 || clientsIdx < 0) {
    return { rows: [], errors: [{ line: 1, message: 'Faltan las columnas obligatorias "Fecha" y/o "Clientes" en el encabezado.' }] };
  }

  const result: ParseResult = { rows: [], errors: [] };
  const seen = new Set<string>();
  const today = formatDate(new Date());
  /** Filas con fecha pero sin número de clientes (por ejemplo, una plantilla sin llenar) */
  const emptyDays: { line: number; date: string }[] = [];
  table.slice(headerRow + 1).forEach((cols, i) => {
    // Número de fila aproximado en el archivo (las filas vacías se omiten al leer)
    const line = headerRow + i + 2;
    const date = parseDateCell(cols[dateIdx] ?? '');
    if (!date) {
      result.errors.push({ line, message: `Fecha inválida "${cols[dateIdx] ?? ''}" (use AAAA-MM-DD o DD/MM/AAAA).` });
      return;
    }
    if (date > today) {
      result.errors.push({ line, message: `La fecha ${date} es futura; solo se registran días ya ocurridos.` });
      return;
    }
    const rawClients = (cols[clientsIdx] ?? '').trim();
    if (!rawClients) {
      emptyDays.push({ line, date });
      return;
    }
    const clients = Number(rawClients);
    if (!rawClients || !Number.isInteger(clients) || clients < 0 || clients > 100000) {
      result.errors.push({ line, message: `Número de clientes inválido "${rawClients}" (debe ser un entero ≥ 0).` });
      return;
    }
    if (seen.has(date)) {
      result.errors.push({ line, message: `La fecha ${date} está repetida en el archivo.` });
      return;
    }
    seen.add(date);
    result.rows.push({
      line,
      date,
      clients,
      promotion: promoIdx >= 0 ? parseBool(cols[promoIdx]) : null,
      estimated: estIdx >= 0 ? parseBool(cols[estIdx]) === true : false,
      observations: obsIdx >= 0 ? (cols[obsIdx] || '').trim() || null : null,
    });
  });
  // Muchos días sin número se resumen en un solo aviso para no llenar la pantalla de errores
  if (emptyDays.length > 3) {
    const first = emptyDays[0], last = emptyDays[emptyDays.length - 1];
    result.errors.unshift({
      line: 0,
      message: !result.rows.length
        ? `El archivo no tiene ningún número de clientes (${emptyDays.length} días sin llenar, del ${first.date} al ${last.date}). Escriba los clientes de cada día en la columna «Clientes» y vuelva a subirlo.`
        : `${emptyDays.length} días no tienen número de clientes (del ${first.date} al ${last.date}) y no se importan. Si esos días no abrió, borre las filas.`,
    });
  } else {
    for (const e of emptyDays) {
      result.errors.push({ line: e.line, message: `El ${e.date} no tiene número de clientes (si ese día no abrió, borre la fila).` });
    }
  }
  return result;
}
