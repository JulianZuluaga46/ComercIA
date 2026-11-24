/** Pruebas de las piezas críticas del servidor. Ejecutar: npm test (en server/). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.ENCRYPTION_KEY ??= randomBytes(32).toString('base64');

const { encrypt, decrypt } = await import('./crypto.js');
const { parseUpload } = await import('./tabular.js');
const { passwordError, temporaryPassword } = await import('./validation.js');
const { defaultThresholds, flowLevel, computeMetrics } = await import('./forecast.js');
const { toCsv, toXlsx, toPdf } = await import('./exporters.js');

test('cifrado AES-256-GCM ida y vuelta, con IV distinto cada vez', () => {
  const a = encrypt('Calle 30 #5-22');
  const b = encrypt('Calle 30 #5-22');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('enc:v1:'));
  assert.equal(decrypt(a), 'Calle 30 #5-22');
  assert.equal(decrypt('texto sin cifrar'), 'texto sin cifrar');
});

test('CSV con punto y coma, fechas DD/MM/AAAA y errores por fila', async () => {
  const csv = 'Fecha;Clientes;Promoción\n14/10/2026;12;si\n2026-10-15;abc;\n2026-13-40;3;\n14/10/2026;9;';
  const r = await parseUpload({ csv });
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.rows[0], { line: 2, date: '2026-10-14', clients: 12, promotion: true, estimated: false, observations: null });
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0].message, /clientes inválido/);
  assert.match(r.errors[2].message, /repetida/);
});

test('CSV de Excel en español: título arriba y punto y coma', async () => {
  const r = await parseUpload({ csv: 'Registro piloto\r\nFecha;Clientes;Observaciones\r\n15/10/2026;12;Lluvia, poca gente\r\n16/10/2026;15;\r\n' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.rows.map(x => [x.date, x.clients, x.observations]), [['2026-10-15', 12, 'Lluvia, poca gente'], ['2026-10-16', 15, null]]);
});

test('plantilla sin llenar: un solo aviso claro', async () => {
  const csv = 'Fecha,Clientes\n' + Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')},`).join('\n');
  const r = await parseUpload({ csv });
  assert.equal(r.rows.length, 0);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /no tiene ningún número de clientes \(10 días/);
});

test('CSV sin columnas obligatorias', async () => {
  const r = await parseUpload({ csv: 'Dia,Total\n2026-10-01,5' });
  assert.equal(r.rows.length, 0);
  assert.match(r.errors[0].message, /Fecha/);
});

test('Excel hecho a mano: título arriba, fechas de Excel, texto, número y fórmula', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Registro de clientes - Octubre']);
  ws.addRow(['Fecha', 'Clientes', 'Observaciones']);
  ws.addRow([new Date(Date.UTC(2026, 9, 1)), 14, 'Lluvia']);
  ws.addRow(['02/10/2026', { formula: '10+3', result: 13 }, null]);
  ws.addRow([{ richText: [{ text: '03/10/' }, { font: { bold: true }, text: '2026' }] }, 8, null]);
  ws.addRow([46299, 11, null]); // 2026-10-04 en una celda con formato "General"
  const fileBase64 = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  const r = await parseUpload({ fileBase64, filename: 'registro.xlsx' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(
    r.rows.map(x => [x.date, x.clients, x.observations]),
    [['2026-10-01', 14, 'Lluvia'], ['2026-10-02', 13, null], ['2026-10-03', 8, null], ['2026-10-04', 11, null]],
  );
});

test('política de contraseñas y contraseña temporal', () => {
  assert.ok(passwordError('corta1'));
  assert.ok(passwordError('soloLetrasLargas'));
  assert.equal(passwordError('segura123'), null);
  for (let i = 0; i < 20; i++) assert.equal(passwordError(temporaryPassword()), null);
});

test('umbrales y nivel de flujo', () => {
  const t = defaultThresholds(14);
  assert.equal(flowLevel(5, t), 'bajo');
  assert.equal(flowLevel(14, t), 'normal');
  assert.equal(flowLevel(t.alto, t), 'alto');
  assert.equal(flowLevel(t.critico + 1, t), 'crítico');
});

test('métricas MAE / RMSE', () => {
  const m = computeMetrics([
    { real: 10, predicted: 12 },
    { real: 20, predicted: 18 },
  ]);
  assert.equal(m.mae, 2);
  assert.equal(m.rmse, 2);
});

test('exportación CSV, Excel y PDF', async () => {
  const table = { title: 'T', subtitle: 's', headers: ['Fecha', 'Clientes'], rows: [['2026-10-01', 12]] };
  assert.match(toCsv(table).toString('utf8'), /Fecha,Clientes/);
  assert.equal((await toXlsx(table)).subarray(0, 2).toString(), 'PK');
  assert.equal((await toPdf(table)).subarray(0, 4).toString(), '%PDF');
});
