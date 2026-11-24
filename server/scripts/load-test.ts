/**
 * Prueba de carga (RNF-02, RNF-05, RF-12). Mide tiempos reales de respuesta de una API en ejecución:
 *   1. con los comercios que ya existen;
 *   2. con LOAD_STORES comercios adicionales (10 × los 25 de la muestra = 250);
 *   3. mientras se reentrena el modelo (el servicio no debe interrumpirse).
 *
 * Crea datos, así que NUNCA debe correr sobre la base real: exige DATABASE_URL en el entorno, apuntando a una COPIA,
 * y que la API corra sobre esa misma copia. Al terminar elimina los comercios que creó.
 *
 *   set DATABASE_URL=file:C:/ruta/copia.db
 *   npm run test:load --prefix server
 */
export {};

const dbUrl = process.env.DATABASE_URL; // antes de leer .env, que define la base real
if (!dbUrl || /dev\.db/i.test(dbUrl)) {
  console.error('Defina DATABASE_URL con una COPIA de la base (no dev.db). Esta prueba crea cientos de comercios.');
  process.exit(1);
}

await import('../src/loadEnv.js');
const { prisma } = await import('../src/db.js');
const { signToken } = await import('../src/middleware/auth.js');
const { addDays, parseDate, todayStr } = await import('../src/dates.js');

const API = process.env.LOAD_API ?? 'http://localhost:3001';
const LOAD_STORES = Number(process.env.LOAD_STORES ?? 250);
const DAYS_PER_STORE = 180;
const REQUESTS = 60;
const PREFIX = 'carga-';

const admin = await prisma.user.findFirst({ where: { role: 'admin', status: 'Activo' } });
if (!admin) throw new Error('La copia no tiene un administrador activo');
const headers = { Authorization: `Bearer ${signToken({ userId: admin.id, role: admin.role })}`, 'Content-Type': 'application/json' };
const today = todayStr();

async function timed(path: string): Promise<{ ms: number; ok: boolean }> {
  const t0 = performance.now();
  try {
    const res = await fetch(API + path, { headers });
    await res.arrayBuffer();
    return { ms: performance.now() - t0, ok: res.ok };
  } catch {
    return { ms: performance.now() - t0, ok: false };
  }
}

/** Lanza `total` peticiones con `concurrency` usuarios simultáneos. */
async function burst(makePath: () => string, total: number, concurrency: number) {
  const results: { ms: number; ok: boolean }[] = [];
  let left = total;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (left-- > 0) results.push(await timed(makePath()));
  }));
  const sorted = results.map(r => r.ms).sort((a, b) => a - b);
  const pct = (p: number) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);
  return { p50: pct(0.5), p95: pct(0.95), max: pct(1), errors: results.filter(r => !r.ok).length };
}

async function measure(label: string, storeIds: string[]) {
  const pick = () => storeIds[Math.floor(Math.random() * storeIds.length)];
  const scenarios: [string, () => string][] = [
    ['Predicción de 7 días', () => `/api/predictions/week?storeId=${pick()}&startDate=${today}`],
    ['Histórico de 90 días', () => `/api/historical?storeId=${pick()}&days=90`],
    ['Lista de comercios', () => '/api/stores'],
    ['Estadísticas (admin)', () => '/api/stats'],
  ];
  console.log(`\n### ${label}\n\n| Operación | Usuarios simultáneos | p50 (ms) | p95 (ms) | máx (ms) | Errores |\n|---|---|---|---|---|---|`);
  for (const [name, makePath] of scenarios) {
    for (const concurrency of [1, 10, 25]) {
      const r = await burst(makePath, REQUESTS, concurrency);
      console.log(`| ${name} | ${concurrency} | ${r.p50} | ${r.p95} | ${r.max} | ${r.errors}/${REQUESTS} |`);
    }
  }
}

async function createLoadStores() {
  for (let i = 1; i <= LOAD_STORES; i++) {
    const id = `${PREFIX}${String(i).padStart(3, '0')}`;
    await prisma.store.create({
      data: {
        id, name: `Carga ${i} (PRUEBA)`, category: 'Ropa y calzado', address: 'Prueba de carga', lat: 8.7575, lng: -75.8877, mapX: 45, mapY: 45,
        employees: 3, yearsInBusiness: 3, avgDailyClients: 20, sensitivityFactors: '[]', description: 'Prueba de carga',
        dataRecords: DAYS_PER_STORE, isTest: true,
      },
    });
    await prisma.dailyRecord.createMany({
      data: Array.from({ length: DAYS_PER_STORE }, (_, d) => ({
        storeId: id,
        date: parseDate(addDays(today, -(d + 1))),
        clients: 10 + ((i * 7 + d * 13) % 30),
      })),
    });
  }
}

const removeLoadStores = () => prisma.store.deleteMany({ where: { id: { startsWith: PREFIX } } });

await removeLoadStores();
const initial = await prisma.store.findMany({ where: { status: 'Activo', dataRecords: { gt: 0 } }, select: { id: true } });
const initialIds = initial.map(s => s.id);
const totalInitial = await prisma.store.count();

console.log(`# Prueba de carga · ${new Date().toISOString()}`);
await measure(`Línea base: ${totalInitial} comercios`, initialIds);

try {
  const t0 = performance.now();
  await createLoadStores();
  console.log(`\n(${LOAD_STORES} comercios con ${DAYS_PER_STORE} días creados en ${Math.round((performance.now() - t0) / 1000)} s)`);
  const ids = (await prisma.store.findMany({ where: { id: { startsWith: PREFIX } }, select: { id: true } })).map(s => s.id);
  await measure(`Con ${totalInitial + LOAD_STORES} comercios y ${(LOAD_STORES * DAYS_PER_STORE).toLocaleString('es-CO')} registros más`, [...initialIds, ...ids]);

  // RF-12: el reentrenamiento no debe interrumpir las predicciones
  console.log('\n### Predicciones durante un reentrenamiento\n');
  const t1 = performance.now();
  let trainingDone = false;
  const training = fetch(`${API}/api/models/train`, { method: 'POST', headers, body: JSON.stringify({ algorithm: 'rf' }) })
    .then(async r => ({ status: r.status, body: (await r.json()) as { version?: string } }))
    .finally(() => { trainingDone = true; });
  let served = 0, failed = 0, worst = 0;
  while (!trainingDone) {
    const r = await timed(`/api/predictions/week?storeId=${initialIds[served % initialIds.length]}&startDate=${today}`);
    served++;
    if (!r.ok) failed++;
    worst = Math.max(worst, r.ms);
  }
  const t = await training;
  console.log(`Entrenamiento: HTTP ${t.status}, modelo ${t.body.version ?? '—'}, ${Math.round((performance.now() - t1) / 1000)} s.`);
  console.log(`Predicciones atendidas durante el entrenamiento: ${served}, fallidas: ${failed}, la más lenta: ${Math.round(worst)} ms.`);
} finally {
  await removeLoadStores();
  await prisma.$disconnect();
}
