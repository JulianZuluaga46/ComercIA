/**
 * Datos iniciales: SOLO datos reales del proyecto.
 * - Comercio piloto con el registro de 70 días (05/08/2026 – 13/10/2026) del anexo de la Fase 1.
 *   Los conteos del 23/09 al 13/10 se marcan como estimados según la nota de transparencia del anexo.
 * No se crean usuarios: el administrador se crea en la pantalla de configuración inicial.
 * El clima NO se siembra: lo descarga el servidor desde Open-Meteo al iniciar.
 */
import '../src/loadEnv.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../src/crypto.js';

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));

const PILOT_ID = 'comercio-piloto';

function loadPilot() {
  const lines = readFileSync(resolve(here, 'data', 'piloto_70dias.csv'), 'utf8').trim().split(/\r?\n/).slice(1);
  return lines.map(l => {
    const [fecha, clientes, estimado] = l.split(',');
    return { date: new Date(`${fecha}T12:00:00`), clients: Number(clientes), estimated: estimado === '1' };
  });
}

function percentile(sorted: number[], p: number) {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

async function main() {
  if ((await prisma.store.count()) > 0) {
    console.log('La base ya tiene datos; no se carga nada. Use "npm run db:reset" para empezar de cero.');
    return;
  }

  const records = loadPilot();
  const mean = records.reduce((a, r) => a + r.clients, 0) / records.length;

  await prisma.store.create({
    data: {
      id: PILOT_ID,
      name: 'Comercio piloto — Centro',
      category: 'Variedades',
      address: encrypt('Centro, Montería'),
      lat: 8.7575,
      lng: -75.8877,
      mapX: 45,
      mapY: 45,
      employees: 0,
      yearsInBusiness: 0,
      avgDailyClients: Math.round(mean),
      sensitivityFactors: JSON.stringify(['fin de semana', 'quincena', 'precipitación']),
      description: encrypt(
        'Establecimiento del centro de Montería que diligenció el registro piloto de la Fase 1 (05/08 – 13/10/2026).',
      ),
      dataRecords: records.length,
      status: 'Activo',
    },
  });

  await prisma.dailyRecord.createMany({
    data: records.map(r => ({ storeId: PILOT_ID, ...r })),
  });

  // Umbrales a partir de la distribución real del piloto
  const sorted = records.map(r => r.clients).sort((a, b) => a - b);
  const bajo = Math.round(percentile(sorted, 0.2));
  const alto = Math.round(percentile(sorted, 0.8));
  await prisma.alertSettings.create({
    data: {
      storeId: PILOT_ID,
      bajo,
      normalMin: bajo,
      normalMax: alto - 1,
      alto,
      critico: Math.round(percentile(sorted, 0.95)),
    },
  });

  console.log(
    `Datos iniciales cargados: comercio piloto con ${records.length} días ` +
      `(${records.filter(r => r.estimated).length} estimados), promedio ${mean.toFixed(1)} clientes/día. ` +
      'Abra la aplicación para crear la cuenta de administrador.',
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
