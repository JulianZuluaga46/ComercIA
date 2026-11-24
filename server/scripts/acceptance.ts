/**
 * Pruebas de aceptación de la ERS contra una API en ejecución: comprueba cada criterio verificable por máquina.
 * Crea comercios y cuentas, y cambia umbrales, así que NUNCA debe correr sobre la base real: exige DATABASE_URL en el
 * entorno, apuntando a una COPIA, y que la API corra sobre esa misma copia.
 *
 *   set DATABASE_URL=file:C:/ruta/copia.db
 *   npm run test:acceptance --prefix server
 */
export {};

const dbUrl = process.env.DATABASE_URL; // antes de leer .env, que define la base real
if (!dbUrl || /dev\.db/i.test(dbUrl)) {
  console.error('Defina DATABASE_URL con una COPIA de la base (no dev.db). Esta prueba crea cuentas y comercios.');
  process.exit(1);
}

await import('../src/loadEnv.js');
const { prisma } = await import('../src/db.js');
const { signToken } = await import('../src/middleware/auth.js');
const { addDays, todayStr } = await import('../src/dates.js');

const API = process.env.LOAD_API ?? 'http://localhost:3001';
const stamp = Date.now().toString(36);
const today = todayStr();
const results: { id: string; ok: boolean; detail: string }[] = [];

function check(id: string, ok: boolean, detail: string) {
  results.push({ id, ok, detail });
  console.log(`| ${id} | ${ok ? 'Cumple' : '**NO cumple**'} | ${detail} |`);
}

async function call(path: string, token: string | null, init: { method?: string; body?: unknown } = {}) {
  const t0 = performance.now();
  const res = await fetch(API + path, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = Math.round(performance.now() - t0);
  let json: any = null;
  try { json = JSON.parse(buf.toString()); } catch { /* binario */ }
  return { status: res.status, ms, json, buf };
}

const adminUser = await prisma.user.findFirst({ where: { role: 'admin', status: 'Activo' } });
const pilot = await prisma.store.findFirst({ where: { isTest: false, dataRecords: { gt: 28 } }, orderBy: { dataRecords: 'desc' } });
const other = await prisma.store.findFirst({ where: { isTest: true } });
if (!adminUser || !pilot || !other) throw new Error('La copia debe tener administrador, comercio real y comercio de prueba');
const admin = signToken({ userId: adminUser.id, role: 'admin' });

console.log(`# Pruebas de aceptación · ${new Date().toISOString()}\n\n| Requisito | Resultado | Evidencia medida |\n|---|---|---|`);

// RF-01
const created = await call('/api/stores', admin, {
  method: 'POST',
  body: { name: `Aceptacion ${stamp}`, category: 'Ropa y calzado', address: 'Calle 30 #5-22', employees: 2, yearsInBusiness: 1, avgDailyClients: 15 },
});
const list = await call('/api/stores', admin);
const visible = created.status === 201 && list.json.some((s: { id: string }) => s.id === created.json.id);
check('RF-01', visible && created.ms + list.ms < 5000, `Comercio creado y visible en la lista en ${created.ms + list.ms} ms (límite 5000)`);
const reg = await call('/api/auth/register', null, {
  method: 'POST',
  body: {
    email: `reg-${stamp}@prueba.test`, password: 'Aceptacion2026', name: 'Registro',
    store: { name: `Registro ${stamp}`, category: 'Ropa y calzado', address: 'Centro', employees: 1, yearsInBusiness: 1, avgDailyClients: 10 },
  },
});
const pending = (await call('/api/stores', admin)).json.find((s: { name: string }) => s.name === `Registro ${stamp}`);
check('RF-01 (autorregistro)', reg.status < 300 && pending?.status === 'Pendiente', `HTTP ${reg.status}; el comercio aparece como ${pending?.status} para el administrador`);

// Cuenta de comerciante para el resto de pruebas
const email = `acept-${stamp}@prueba.test`;
const password = 'Aceptacion2026';
const newUser = await call('/api/users', admin, { method: 'POST', body: { email, password, name: 'Aceptación', role: 'comerciante', storeId: pilot.id } });
const login = await call('/api/auth/login', null, { method: 'POST', body: { email, password } });
const merchant: string = login.json.token;

// RF-02
const usersDenied = await call('/api/users', merchant);
const storeDenied = await call(`/api/predictions/week?storeId=${other.id}&startDate=${today}`, merchant);
const trainDenied = await call('/api/models/train', merchant, { method: 'POST', body: {} });
const noToken = await call('/api/stores', null);
check('RF-02 (roles)', usersDenied.status === 403 && storeDenied.status === 403 && trainDenied.status === 403 && noToken.status === 401,
  `Comerciante: usuarios ${usersDenied.status}, otro comercio ${storeDenied.status}, entrenar ${trainDenied.status}; sin sesión ${noToken.status}`);
const victim = `bloqueo-${stamp}@prueba.test`;
await call('/api/users', admin, { method: 'POST', body: { email: victim, password, name: 'Bloqueo', role: 'analista' } });
const attempts: number[] = [];
for (let i = 0; i < 6; i++) attempts.push((await call('/api/auth/login', null, { method: 'POST', body: { email: victim, password: 'Incorrecta123' } })).status);
const lockedGood = await call('/api/auth/login', null, { method: 'POST', body: { email: victim, password } });
check('RF-02 (bloqueo)', attempts[3] === 401 && attempts[4] === 423 && lockedGood.status === 423,
  `Intentos: ${attempts.join(', ')}; con la contraseña correcta, ya bloqueada: ${lockedGood.status}`);

// RF-03
const importDate = addDays(today, -1);
const csv = `Fecha;Clientes\n${importDate};14\n${addDays(today, -2)};abc\n2026-13-40;3`;
const imported = await call('/api/historical/import', merchant, { method: 'POST', body: { storeId: pilot.id, csv } });
const bad = await call('/api/historical/import', merchant, { method: 'POST', body: { storeId: pilot.id, csv: 'Fecha;Clientes\nnada;nada' } });
check('RF-03', imported.status < 300 && imported.json.imported === 1 && imported.json.errors?.length === 2 && bad.status === 400,
  `Guardó ${imported.json.imported} fila válida y reportó ${imported.json.errors?.length} errores por fila; archivo inválido: HTTP ${bad.status} «${bad.json?.error}»`);
const manual = await call('/api/historical', merchant, { method: 'POST', body: { storeId: pilot.id, date: importDate, clients: 15 } });
const future = await call('/api/historical', merchant, { method: 'POST', body: { storeId: pilot.id, date: addDays(today, 1), clients: 15 } });
check('RF-03 (manual)', manual.status === 201 && future.status === 400, `Registro manual: ${manual.status}; fecha futura rechazada: ${future.status}`);

// RF-04
const platform = await call('/api/platform', admin);
const w = platform.json.services.weather;
const syncedToday = w.lastSync && Date.now() - new Date(w.lastSync).getTime() < 24 * 3600 * 1000;
check('RF-04', w.ok && !!syncedToday && w.forecastUntil >= today, `Open-Meteo sincronizado ${w.lastSync} sin intervención; pronóstico hasta ${w.forecastUntil}`);

// RF-07, RF-08, RNF-02
const week = await call(`/api/predictions/week?storeId=${pilot.id}&startDate=${today}`, merchant);
check('RF-07 / RNF-02', week.status === 200 && week.json.length === 7 && week.ms < 10000, `7 días predichos en ${week.ms} ms (límite 10000)`);
const range = await call(`/api/predictions/range?storeId=${pilot.id}&from=${addDays(today, 2)}&to=${addDays(today, 5)}`, merchant);
const rangeOk = range.json?.length === 4 && range.json[0].date === addDays(today, 2) && range.json[3].date === addDays(today, 5);
check('RF-08', rangeOk, `Filtro por rango: pidió 4 días y devolvió ${range.json?.length} con las fechas exactas`);

// RF-09
const before = (await call('/api/notifications', merchant)).json.length;
await call('/api/alerts/settings', merchant, { method: 'PUT', body: { storeId: pilot.id, bajo: 1, alto: 2, critico: 3 } });
let after = before;
for (let i = 0; i < 40 && after <= before; i++) {
  await new Promise(r => setTimeout(r, 500));
  after = (await call('/api/notifications', merchant)).json.length;
}
const invalid = await call('/api/alerts/settings', merchant, { method: 'PUT', body: { storeId: pilot.id, bajo: 9, alto: 2, critico: 3 } });
check('RF-09', after > before && invalid.status === 400, `Al superar el umbral configurado el comerciante pasó de ${before} a ${after} alertas; umbrales contradictorios: HTTP ${invalid.status}`);

// RF-10
for (const [formato, magic] of [['PDF', '%PDF'], ['Excel', 'PK'], ['CSV', '']] as const) {
  const rep = await call('/api/reports', merchant, { method: 'POST', body: { tipo: 'Predicciones', formato, fechaInicio: today, fechaFin: addDays(today, 6) } });
  const dl = await call(`/api/reports/${rep.json.id}/download`, merchant);
  const ok = rep.status === 201 && dl.status === 200 && dl.buf.subarray(0, magic.length).toString() === magic && dl.buf.length > 100;
  check(`RF-10 (${formato})`, ok, `Reporte de 7 días descargado: ${dl.buf.length} bytes`);
}

// RF-11
const uid: string = newUser.json.id;
const edit = await call(`/api/users/${uid}`, admin, { method: 'PATCH', body: { name: 'Aceptación editada', role: 'comerciante', storeId: pilot.id } });
await call(`/api/users/${uid}/status`, admin, { method: 'PATCH', body: { status: 'Inactivo' } });
const cut = await call('/api/auth/me', merchant);
await call(`/api/users/${uid}/status`, admin, { method: 'PATCH', body: { status: 'Activo' } });
const back = await call('/api/auth/me', merchant);
check('RF-11', edit.status === 200 && cut.status >= 401 && cut.status < 404 && back.status === 200,
  `Editar: ${edit.status}. Mismo token: al desactivar ${cut.status} (inmediato), al reactivar ${back.status}`);

// RF-06, RF-12, RF-13
const runsBefore = (await call('/api/models', admin)).json.length;
const train = await call('/api/models/train', admin, { method: 'POST', body: { algorithm: 'rf' } });
const runsAfter = (await call('/api/models', admin)).json;
const active = runsAfter.find((m: { active: boolean }) => m.active);
check('RF-06 / RF-12 / RF-13', train.status < 300 && typeof active?.mae === 'number' && typeof active?.rmse === 'number' && runsAfter.length === runsBefore + 1,
  `Entrenó ${active?.version} en ${Math.round(train.ms / 1000)} s: MAE ${active?.mae}, RMSE ${active?.rmse}; histórico de ${runsBefore} a ${runsAfter.length} versiones`);

// RF-14
const hist = await call(`/api/historical?storeId=${pilot.id}&days=730`, merchant);
const both = hist.json.filter((d: { real: number; predicted: number | null }) => d.real != null && d.predicted != null).length;
check('RF-14', both > 0, `${both} días con ambas series (real y predicho) para el gráfico único`);

// RNF-04
const rawStore = await prisma.store.findUnique({ where: { id: created.json.id } });
const rawUser = await prisma.user.findUnique({ where: { email } });
check('RNF-04 (en la base)', !!rawStore?.address.startsWith('enc:v1:') && !rawStore.address.includes('Calle') && !!rawUser?.passwordHash.startsWith('$2'),
  `Dirección guardada como ${rawStore?.address.slice(0, 12)}…; contraseña como hash bcrypt`);

await prisma.$disconnect();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} de ${results.length} comprobaciones cumplen.`);
process.exit(failed ? 1 : 0);
