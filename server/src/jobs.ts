/**
 * Procesos automáticos del actor "Sistema":
 * - RF-04: sincronizar clima de Open-Meteo (al iniciar y cada 6 h).
 * - RF-12: reentrenar si hay ≥ 7 registros nuevos desde el último entrenamiento.
 * - RF-09: generar alertas de flujo alto/bajo para los próximos 7 días.
 */
import { prisma } from './db.js';
import { addDays, dateRange, parseDate, todayStr } from './dates.js';
import { createReport } from './routes/reports.js';
import { activeModel, predictForStore } from './forecast.js';
import { syncWeather } from './weather.js';
import { trainModel, trainingStatus, type TrainOptions } from './training.js';
import { recommendationsFor } from './recommendations.js';
import { backupDatabase } from './backup.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;
/** RF-12: registros nuevos para reentrenar. La copia de exposición lo baja con RETRAIN_MIN_NEW_RECORDS. */
export const RETRAIN_MIN_NEW_RECORDS = Math.max(1, Number(process.env.RETRAIN_MIN_NEW_RECORDS) || 7);

export const jobStatus = {
  lastRun: null as Date | null,
  lastRetrain: null as Date | null,
  alertsCreated: 0,
  lastError: null as string | null,
};

/** Mínimo de registros para el primer entrenamiento (igual que MIN_RECORDS en server/ml/app.py) */
const MIN_RECORDS_FIRST_TRAINING = 28;

/** ¿Toca entrenar? (RF-12): ≥ 7 registros nuevos que el modelo activo usaría, o el primer modelo con datos suficientes. */
async function retrainCheck() {
  const model = await activeModel();
  if (!model) {
    const total = await prisma.dailyRecord.count({ where: { store: { isTest: false } } });
    return {
      model: null,
      newRecords: total,
      threshold: MIN_RECORDS_FIRST_TRAINING,
      algorithmKey: 'rf',
      opts: { trigger: 'automatico' } as TrainOptions,
    };
  }
  const newRecords = await prisma.dailyRecord.count({
    where: {
      createdAt: { gt: model.createdAt },
      // Solo cuentan los registros que ese modelo usaría
      ...(model.includesTestData ? {} : { store: { isTest: false } }),
      ...(model.excludeEstimated ? { estimated: false } : {}),
    },
  });
  return {
    model,
    newRecords,
    threshold: RETRAIN_MIN_NEW_RECORDS,
    algorithmKey: model.algorithmKey,
    opts: { excludeEstimated: model.excludeEstimated, includeTestData: model.includesTestData, trigger: 'automatico' } as TrainOptions,
  };
}

async function maybeRetrain() {
  const check = await retrainCheck();
  if (check.newRecords < check.threshold || trainingStatus.running) return;
  console.log(
    check.model
      ? `[jobs] ${check.newRecords} registros nuevos: reentrenando ${check.model.algorithm}…`
      : '[jobs] No hay modelo activo: entrenando Random Forest inicial…',
  );
  await trainModel(check.algorithmKey, check.opts);
  jobStatus.lastRetrain = new Date();
}

/**
 * Qué pasa con el aprendizaje después de guardar datos de un comercio:
 * - started: ya tocaba (RF-12) y empezó a aprender en segundo plano, sin esperar la revisión de cada 6 h.
 * - waiting: aún no se juntan los registros nuevos necesarios.
 * - busy: ya está aprendiendo; los datos nuevos entran la próxima vez.
 * - excluded: comercio de prueba y el modelo activo no usa datos de prueba.
 */
export type LearningStatus = {
  status: 'started' | 'waiting' | 'busy' | 'excluded';
  newRecords: number;
  threshold: number;
  firstModel: boolean;
};

export async function learnAfterNewData(storeId: string): Promise<LearningStatus> {
  const [store, check] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { isTest: true } }),
    retrainCheck(),
  ]);
  const info = { newRecords: check.newRecords, threshold: check.threshold, firstModel: !check.model };
  if (store?.isTest && !check.model?.includesTestData) return { status: 'excluded', ...info };
  if (trainingStatus.running) return { status: 'busy', ...info };
  if (check.newRecords < check.threshold) return { status: 'waiting', ...info };

  console.log(`[aprendizaje] ${check.newRecords} registros nuevos tras guardar datos: entrenando…`);
  // trainModel marca el entrenamiento como en curso antes de su primer await, así que no se lanzan dos a la vez
  void trainModel(check.algorithmKey, check.opts)
    .then(async () => {
      jobStatus.lastRetrain = new Date();
      await generateAlerts();
    })
    .catch(err => console.error('[aprendizaje] Error:', (err as Error).message));
  return { status: 'started', ...info };
}

/** Alertas de flujo para los próximos 7 días; con storeId solo para ese comercio. */
export async function generateAlerts(storeId?: string) {
  const stores = await prisma.store.findMany({
    where: { status: 'Activo', ...(storeId ? { id: storeId } : {}) },
    include: {
      users: {
        // Solo usuarios que mantienen activadas las alertas de flujo en Configuración
        where: { status: 'Activo', role: 'comerciante', OR: [{ settings: null }, { settings: { pushNotif: true } }] },
      },
    },
  });
  const dates = dateRange(addDays(todayStr(), 1), addDays(todayStr(), 7));
  let created = 0;
  for (const store of stores) {
    if (!store.users.length) continue;
    let preds;
    try {
      preds = await predictForStore(store.id, dates);
    } catch {
      continue;
    }
    for (const p of preds) {
      if (p.flowLevel === 'normal') continue;
      const when = parseDate(p.date).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
      const title = `Flujo ${p.flowLevel} previsto el ${when}`;
      // La alerta deja de mostrarse cuando termina ese día
      const expiresAt = new Date(`${p.date}T23:59:59`);
      for (const u of store.users) {
        const exists = await prisma.notification.findFirst({ where: { userId: u.id, title } });
        if (exists) continue;
        await prisma.notification.create({
          data: {
            userId: u.id,
            type: p.flowLevel === 'bajo' ? 'info' : p.flowLevel === 'alto' ? 'warning' : 'danger',
            title,
            message: recommendationsFor(p).join(' '),
            expiresAt,
          },
        });
        created++;
      }
    }
  }
  jobStatus.alertsCreated += created;
  if (created) console.log(`[jobs] ${created} alertas nuevas`);
}

/** Reporte semanal (lunes: predicción de la semana) y mensual (día 1: histórico del mes anterior). */
async function scheduledReports() {
  const today = todayStr();
  const d = parseDate(today);
  const weekly = d.getDay() === 1;
  const monthly = d.getDate() === 1;
  if (!weekly && !monthly) return;
  const users = await prisma.user.findMany({
    where: { status: 'Activo', role: 'comerciante', storeId: { not: null }, store: { status: 'Activo' } },
    include: { settings: true },
  });
  for (const u of users) {
    const jobs: { name: string; tipo: string; from: string; to: string }[] = [];
    if (weekly && u.settings?.weeklyReport !== false) {
      jobs.push({ name: `Reporte semanal ${today}`, tipo: 'Predicciones', from: today, to: addDays(today, 6) });
    }
    if (monthly && u.settings?.monthlyReport !== false) {
      const prevEnd = addDays(today, -1);
      jobs.push({ name: `Reporte mensual ${prevEnd.slice(0, 7)}`, tipo: 'Histórico', from: `${prevEnd.slice(0, 7)}-01`, to: prevEnd });
    }
    for (const j of jobs) {
      if (await prisma.report.findFirst({ where: { userId: u.id, name: j.name } })) continue;
      try {
        await createReport({ userId: u.id, storeId: u.storeId!, tipo: j.tipo, formato: 'PDF', from: j.from, to: j.to, name: j.name });
        await prisma.notification.create({
          data: { userId: u.id, type: 'info', title: `${j.name} disponible`, message: 'Descárgalo en la sección Reportes.' },
        });
      } catch (err) {
        console.error(`[jobs] No se pudo generar ${j.name}:`, (err as Error).message);
      }
    }
  }
}

/** Quita las alertas de flujo de días pasados creadas antes de que existiera expiresAt. */
async function cleanupOldAlerts() {
  const old = await prisma.notification.findMany({
    where: { title: { startsWith: 'Flujo ' }, expiresAt: null },
    select: { id: true, title: true },
  });
  const today = todayStr();
  const stale = old.filter(n => {
    const m = n.title.match(/(\d{4}-\d{2}-\d{2})$/);
    return m ? m[1] < today : false;
  });
  if (stale.length) await prisma.notification.deleteMany({ where: { id: { in: stale.map(n => n.id) } } });
}

export async function runJobs() {
  try {
    await backupDatabase().catch(err => console.error('[respaldo] Error:', (err as Error).message));
    await syncWeather().catch(() => {});
    await cleanupOldAlerts();
    await maybeRetrain();
    await generateAlerts();
    await scheduledReports();
    jobStatus.lastError = null;
  } catch (err) {
    jobStatus.lastError = (err as Error).message;
    console.error('[jobs] Error:', (err as Error).message);
  } finally {
    jobStatus.lastRun = new Date();
  }
}

export function startJobs() {
  void runJobs();
  setInterval(() => void runJobs(), SIX_HOURS);
}
