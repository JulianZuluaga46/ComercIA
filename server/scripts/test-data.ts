/**
 * Comercios de PRUEBA con datos inventados.
 *   npm run test-data          genera los datos (Python), los carga en la BD y escribe datos-de-prueba/
 *   npm run test-data:remove   elimina de la BD los comercios de prueba y sus cuentas
 * Los comercios quedan marcados con isTest = true y no se usan para entrenar salvo que el analista lo elija.
 */
import '../src/loadEnv.js';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { prisma } from '../src/db.js';
import { encrypt } from '../src/crypto.js';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mlDir = resolve(serverDir, 'ml');
const outDir = resolve(serverDir, '..', 'datos-de-prueba');

interface StoreDef {
  id: string;
  nombre: string;
  categoria: string;
  direccion: string;
  empleados: number;
  antiguedad: number;
  base: number;
  dia_semana: number[];
  quincena: number;
  previa_quincena: number;
  post_quincena: number;
  fin_mes: number;
  festivo: number;
  meses: Record<string, number>;
  eventos: Record<string, number>;
  lluvia_por_mm: number;
  lluvia_tope: number;
  calor_mayor_34: number;
  tendencia_anual: number;
  cerrado: string[];
  descripcion: string;
}
interface Params {
  advertencia: string;
  semilla: number;
  desde: string;
  hasta: string;
  contrasena_cuentas: string;
  comercios: StoreDef[];
  resumen: { id: string; dias: number; promedio: number; minimo: number; maximo: number }[];
  extensiones?: { desde: string; hasta: string; semilla: number[] }[];
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 1000) / 10} %`;
const emailFor = (id: string) => `${id.replace(/^prueba-/, '')}@prueba.comercia.co`;

function python() {
  return process.platform === 'win32'
    ? resolve(mlDir, '.venv', 'Scripts', 'python.exe')
    : resolve(mlDir, '.venv', 'bin', 'python');
}

function readCsv(file: string): Record<string, string>[] {
  const [head, ...lines] = readFileSync(file, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map(l => {
    const v = l.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
  });
}

function percentile(sorted: number[], p: number) {
  const i = (sorted.length - 1) * p;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i - Math.floor(i));
}

async function load(skipGenerate: boolean) {
  if (!skipGenerate) {
    execFileSync(python(), ['generate_test_data.py', '--out', outDir], { cwd: mlDir, stdio: 'inherit' });
  }
  const params = JSON.parse(readFileSync(resolve(outDir, 'parametros.json'), 'utf8')) as Params;
  const passwordHash = await bcrypt.hash(params.contrasena_cuentas, 10);

  for (const s of params.comercios) {
    const rows = readCsv(resolve(outDir, `${s.id}.csv`));
    const values = rows.map(r => Number(r.clientes));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const sorted = [...values].sort((a, b) => a - b);

    // Recrear desde cero para que siempre coincida con los archivos
    await prisma.user.deleteMany({ where: { storeId: s.id } });
    await prisma.store.deleteMany({ where: { id: s.id } });
    await prisma.store.create({
      data: {
        id: s.id,
        name: s.nombre,
        category: s.categoria,
        address: encrypt(s.direccion),
        lat: 8.7575,
        lng: -75.8877,
        mapX: 45,
        mapY: 45,
        employees: s.empleados,
        yearsInBusiness: s.antiguedad,
        avgDailyClients: Math.round(avg),
        sensitivityFactors: JSON.stringify([]),
        description: encrypt(`DATOS DE PRUEBA (inventados). ${s.descripcion}`),
        dataRecords: rows.length,
        status: 'Activo',
        isTest: true,
      },
    });
    await prisma.dailyRecord.createMany({
      data: rows.map(r => ({
        storeId: s.id,
        date: new Date(`${r.fecha}T12:00:00`),
        clients: Number(r.clientes),
        observations: encrypt('Dato de prueba (inventado)'),
      })),
    });
    const bajo = Math.round(percentile(sorted, 0.2));
    const alto = Math.round(percentile(sorted, 0.8));
    await prisma.alertSettings.create({
      data: { storeId: s.id, bajo, normalMin: bajo, normalMax: alto - 1, alto, critico: Math.round(percentile(sorted, 0.95)) },
    });
    await prisma.user.create({
      data: {
        email: emailFor(s.id),
        name: `Comerciante ${s.nombre.replace(' (PRUEBA)', '')}`,
        passwordHash,
        role: 'comerciante',
        status: 'Activo',
        storeId: s.id,
        settings: { create: {} },
      },
    });
    console.log(`  ✓ ${s.nombre}: ${rows.length} días cargados`);
  }

  writeReadme(params);
  await writeWorkbook(params);
  console.log(`\nDocumentación en ${outDir}\\LEEME.md y datos_de_prueba.xlsx`);
  console.log('Reentrene el modelo (Analista → Entrenamiento) marcando «Incluir comercios de prueba» para que los use.');
}

/** Agrega días nuevos sin cambiar los existentes ni tocar cuentas, notificaciones o reportes. */
async function extend(end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('La fecha debe tener el formato AAAA-MM-DD');
  const paramsFile = resolve(outDir, 'parametros.json');
  const before = JSON.parse(readFileSync(paramsFile, 'utf8')) as Params;
  if (end > before.hasta) {
    execFileSync(python(), ['generate_test_data.py', '--out', outDir, '--extend-to', end], { cwd: mlDir, stdio: 'inherit' });
  }
  const params = JSON.parse(readFileSync(paramsFile, 'utf8')) as Params;

  for (const s of params.comercios) {
    const store = await prisma.store.findUnique({ where: { id: s.id }, select: { isTest: true } });
    if (!store?.isTest) throw new Error(`${s.nombre} no está cargado como comercio de prueba. Ejecute npm run test-data.`);
    const rows = readCsv(resolve(outDir, `${s.id}.csv`));
    const existing = await prisma.dailyRecord.findMany({ where: { storeId: s.id }, select: { date: true } });
    const known = new Set(existing.map(r => r.date.getTime()));
    const toDate = (fecha: string) => new Date(`${fecha}T12:00:00`);
    const added = rows.filter(r => !known.has(toDate(r.fecha).getTime()));
    const observations = encrypt('Dato de prueba (inventado)');
    await prisma.dailyRecord.createMany({
      data: added.map(r => ({ storeId: s.id, date: toDate(r.fecha), clients: Number(r.clientes), observations })),
    });
    const avg = rows.reduce((a, r) => a + Number(r.clientes), 0) / rows.length;
    await prisma.store.update({
      where: { id: s.id },
      data: { dataRecords: rows.length, avgDailyClients: Math.round(avg) },
    });
    console.log(`  ✓ ${s.nombre}: +${added.length} días (${rows.length} en total)`);
  }

  writeReadme(params);
  await writeWorkbook(params);
}

function effectsRows(s: StoreDef): [string, string][] {
  const meses = Object.entries(s.meses).map(([m, v]) => `${MONTHS[Number(m)]} ${pct(v)}`).join(', ') || '—';
  const eventos = Object.entries(s.eventos).map(([e, v]) => `${e} ${pct(v)}`).join(', ') || '—';
  return [
    ['Categoría', s.categoria],
    ['Base diaria', `${s.base} clientes`],
    ['Día de la semana (×)', s.dia_semana.map((v, i) => `${DAYS[i]} ${v}`).join(' · ')],
    ['Quincena / víspera / día siguiente', `${pct(s.quincena)} / ${pct(s.previa_quincena)} / ${pct(s.post_quincena)}`],
    ['Fin de mes', pct(s.fin_mes)],
    ['Festivo', pct(s.festivo)],
    ['Temporada (mes)', meses],
    ['Eventos (día; 60 % del efecto los 2 días previos)', eventos],
    ['Lluvia', `${pct(s.lluvia_por_mm)} por mm (máx. ${pct(s.lluvia_tope)})`],
    ['Calor > 34 °C', pct(s.calor_mayor_34)],
    ['Tendencia en el período', pct(s.tendencia_anual)],
    ['Cerrado', s.cerrado.join(', ') || '—'],
  ];
}

function writeReadme(p: Params) {
  const lines: string[] = [
    '# Datos de prueba de ComercIA',
    '',
    `> ⚠️ **${p.advertencia}**`,
    '',
    `Período: **${p.desde} a ${p.hasta}** · semilla aleatoria **${p.semilla}**.`,
    '',
    ...(p.extensiones ?? []).map(
      e => `Días agregados después: **${e.desde} a ${e.hasta}** · semilla **${e.semilla.join(', ')}**. Los días anteriores no cambiaron.`,
    ),
    '`npm run test-data` regenera solo el período original (hasta 2026-10-19) y borra los días agregados.',
    '',
    '## Cómo se calculó cada día',
    '',
    '```',
    'esperado = base × día_semana × pago × festivo × temporada × evento × clima × tendencia',
    'clientes = número aleatorio Poisson(esperado)',
    '```',
    '',
    '- El **clima es real** (Open-Meteo, Montería): la lluvia reduce el flujo los días que de verdad llovió.',
    '- Quincenas, festivos y eventos usan **el mismo calendario que el modelo**.',
    '- Alrededor del 1,5 % de los días se omiten a propósito ("el comerciante no registró") y los días de cierre no tienen registro.',
    '- Cada archivo CSV trae, además de los clientes, todos los factores aplicados ese día para poder auditarlo.',
    '',
    '## Comercios y cuentas',
    '',
    `Todas las cuentas usan la contraseña **${p.contrasena_cuentas}** (también pueden entrar con código por correo; sin SMTP el código aparece en la terminal del servidor).`,
    '',
    '| Comercio | Categoría | Cuenta | Días | Promedio | Mín | Máx | Archivo |',
    '|---|---|---|---|---|---|---|---|',
    ...p.comercios.map(s => {
      const r = p.resumen.find(x => x.id === s.id)!;
      return `| ${s.nombre} | ${s.categoria} | ${emailFor(s.id)} | ${r.dias} | ${r.promedio} | ${r.minimo} | ${r.maximo} | \`${s.id}.csv\` |`;
    }),
    '',
    '## Perfil de cada comercio',
    '',
  ];
  for (const s of p.comercios) {
    lines.push(`### ${s.nombre}`, '', s.descripcion, '', '| Efecto | Valor |', '|---|---|');
    for (const [k, v] of effectsRows(s)) lines.push(`| ${k} | ${v} |`);
    lines.push('');
  }
  lines.push(
    '## Comandos',
    '',
    '```bash',
    'cd server',
    'npm run test-data          # regenera y vuelve a cargar todo (reemplaza los comercios de prueba)',
    'npm run test-data:extend   # agrega días hasta hoy sin cambiar los existentes (o: -- AAAA-MM-DD)',
    'npm run test-data:remove   # elimina los comercios y cuentas de prueba de la base de datos',
    '```',
    '',
    'Para cambiar un comercio, edite su perfil en `server/ml/generate_test_data.py` y ejecute `npm run test-data`.',
    '',
    '## Importante para la investigación',
    '',
    '- En la aplicación estos comercios aparecen con la etiqueta **PRUEBA**.',
    '- Por defecto el modelo **no** se entrena con ellos. Para usarlos, en *Analista → Entrenamiento* marque',
    '  «Incluir comercios de prueba»; el modelo resultante queda marcado como «con datos de prueba».',
    '- Las métricas de un modelo con datos de prueba **no** sirven como resultado de la hipótesis: el modelo está',
    '  aprendiendo reglas que nosotros inventamos. Sirven para comprobar que el sistema funciona con un año de datos.',
  );
  writeFileSync(resolve(outDir, 'LEEME.md'), lines.join('\n'), 'utf8');
}

async function writeWorkbook(p: Params) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ComercIA';
  const bold = { bold: true };

  const res = wb.addWorksheet('Resumen');
  res.addRow([p.advertencia]).font = { bold: true, color: { argb: 'FFB91C1C' } };
  res.addRow([`Período ${p.desde} a ${p.hasta} · semilla ${p.semilla} · contraseña de las cuentas: ${p.contrasena_cuentas}`]);
  res.addRow([]);
  res.addRow(['Comercio', 'Categoría', 'Cuenta', 'Días', 'Promedio', 'Mín', 'Máx', 'Descripción']).font = bold;
  for (const s of p.comercios) {
    const r = p.resumen.find(x => x.id === s.id)!;
    res.addRow([s.nombre, s.categoria, emailFor(s.id), r.dias, r.promedio, r.minimo, r.maximo, s.descripcion]);
  }
  res.columns.forEach((c, i) => (c.width = [32, 16, 38, 8, 10, 6, 6, 80][i]));

  const par = wb.addWorksheet('Parámetros');
  par.addRow(['Comercio', 'Efecto', 'Valor']).font = bold;
  for (const s of p.comercios) for (const [k, v] of effectsRows(s)) par.addRow([s.nombre, k, v]);
  par.columns.forEach((c, i) => (c.width = [32, 44, 90][i]));

  for (const s of p.comercios) {
    const rows = readCsv(resolve(outDir, `${s.id}.csv`));
    const ws = wb.addWorksheet(s.nombre.replace(' (PRUEBA)', '').slice(0, 31));
    const cols = Object.keys(rows[0]);
    ws.addRow(cols).font = bold;
    for (const r of rows) ws.addRow(cols.map(c => (c === 'fecha' || c === 'dia' || c === 'festivo' || c === 'evento' ? r[c] : Number(r[c]))));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.columns.forEach(c => (c.width = 13));
  }
  await wb.xlsx.writeFile(resolve(outDir, 'datos_de_prueba.xlsx'));
}

async function remove() {
  const stores = await prisma.store.findMany({ where: { isTest: true }, select: { id: true, name: true } });
  await prisma.user.deleteMany({ where: { storeId: { in: stores.map(s => s.id) } } });
  await prisma.store.deleteMany({ where: { isTest: true } });
  console.log(`Eliminados ${stores.length} comercios de prueba: ${stores.map(s => s.name).join(', ') || '—'}`);
}

const cmd = process.argv[2];
try {
  if (cmd === 'load') await load(process.argv.includes('--skip-generate'));
  else if (cmd === 'extend') await extend(process.argv[3] ?? new Date().toLocaleDateString('en-CA'));
  else if (cmd === 'remove') await remove();
  else console.log('Uso: tsx scripts/test-data.ts load|extend [AAAA-MM-DD]|remove');
} finally {
  await prisma.$disconnect();
}
