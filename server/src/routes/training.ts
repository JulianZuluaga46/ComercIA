/**
 * Entrenamiento visto desde un comercio: qué está aprendiendo el sistema en este momento, con cuántos datos
 * de ese comercio y qué tan acertado resulta allí frente al método empírico.
 * Lo consultan el comerciante (solo su comercio), el analista y el administrador.
 */
import { Router, type Request } from 'express';
import type { ModelRun, Store } from '@prisma/client';
import { prisma } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { formatDate } from '../dates.js';
import { trainingStatus } from '../training.js';
import { jobStatus, RETRAIN_MIN_NEW_RECORDS } from '../jobs.js';
import { mlCalendar, type MlCalendar } from '../ml.js';
import { conditionText } from '../weather.js';

export const trainingRouter = Router();

trainingRouter.use(authRequired);

/** Mismos valores que server/ml/app.py */
const MIN_RECORDS = 28;
const INITIAL_WINDOW_DAYS = 42;
const HISTORY_RUNS = 10;
/** Días de la prueba que se muestran al comerciante, día por día */
const CHECK_DAYS = 14;

function canAccess(req: Request, storeId: string) {
  return !(req.auth!.role === 'comerciante' && req.auth!.storeId !== storeId);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type StoreRecord = { date: Date; clients: number; estimated: boolean; createdAt: Date };

/** Participación del comercio en un entrenamiento y su error en la validación walk-forward. */
function storeRunSummary(run: ModelRun, store: Store, records: StoreRecord[]) {
  const excludedReason = store.isTest && !run.includesTestData ? 'comercio de prueba (excluido de este modelo)' : null;
  const through = new Date(`${run.trainedThrough}T23:59:59`);
  // Registros que existían cuando se entrenó y que el modelo podía usar
  const recordsUsed = excludedReason
    ? 0
    : records.filter(r => r.date <= through && r.createdAt <= run.createdAt && !(run.excludeEstimated && r.estimated))
        .length;

  const real = new Map(records.map(r => [formatDate(r.date), r.clients]));
  const backtest = (JSON.parse(run.backtest || '[]') as { storeId: string; date: string; predicted: number; baseline?: number }[])
    .filter(b => b.storeId === store.id && real.has(b.date));
  const errors = backtest.map(b => Math.abs(real.get(b.date)! - b.predicted));
  const hasBaseline = backtest.length > 0 && backtest.every(b => b.baseline != null);
  const baseErrors = hasBaseline ? backtest.map(b => Math.abs(real.get(b.date)! - b.baseline!)) : [];
  const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((a, x) => a + x, 0) / xs.length) : null);

  return {
    version: run.version,
    algorithm: run.algorithm,
    createdAt: run.createdAt.toISOString(),
    trainedThrough: run.trainedThrough,
    active: run.active,
    included: !excludedReason && recordsUsed > 0,
    excludedReason: excludedReason ?? (recordsUsed === 0 ? 'el comercio aún no tenía registros' : null),
    recordsUsed,
    totalRecords: run.records,
    evaluatedDays: backtest.length,
    mae: avg(errors),
    /** null si el modelo es anterior a que se guardara el método empírico por día */
    baselineMae: hasBaseline ? avg(baseErrors) : null,
    within2Pct: errors.length ? Math.round((errors.filter(e => e <= 2).length / errors.length) * 100) : null,
    globalMae: run.mae,
    globalBaselineMae: run.baselineMae,
    durationMs: run.durationMs,
    includesTestData: run.includesTestData,
    excludeEstimated: run.excludeEstimated,
  };
}

/** Etiquetas de calendario de un día, en palabras del comerciante. */
function calendarTags(c: MlCalendar): string[] {
  const tags: string[] = [];
  if (c.holidayName) tags.push(`Festivo: ${c.holidayName}`);
  if (c.isQuincena) tags.push('Día de quincena');
  if (c.isPreQuincena) tags.push('Víspera de quincena');
  if (c.isPostQuincena) tags.push('Día después de quincena');
  if (c.isEndOfMonth) tags.push('Fin de mes');
  if (c.isStartOfMonth) tags.push('Inicio de mes');
  if (c.event) tags.push(c.event);
  if (c.schoolBreak) tags.push(`Vacaciones: ${c.schoolBreak}`);
  tags.push(c.season);
  return tags;
}

/**
 * Material para explicar el aprendizaje con los datos del propio comercio: su día normal, un día de ejemplo con
 * las etiquetas que le pone el sistema, lo que más pesa en el modelo y la prueba día por día.
 */
async function buildExplain(active: ModelRun | null, store: Store, records: StoreRecord[]) {
  const storeAverage = records.length
    ? Math.round((records.reduce((a, r) => a + r.clients, 0) / records.length) * 10) / 10
    : null;

  // Día de ejemplo: el último registrado que tenga clima guardado (sin clima, el sistema no lo usa)
  let example = null;
  const recent = records.slice(-30).reverse();
  if (recent.length) {
    const dates = recent.map(r => formatDate(r.date));
    const weather = new Map(
      (await prisma.weatherDaily.findMany({ where: { date: { in: dates } } })).map(w => [w.date, w]),
    );
    const rec = recent.find(r => weather.has(formatDate(r.date)));
    if (rec) {
      const date = formatDate(rec.date);
      const w = weather.get(date)!;
      const cal = await mlCalendar([date]).catch(() => null);
      example = {
        date,
        clients: rec.clients,
        tmax: Math.round(w.tmax),
        precip: Math.round(w.precip * 10) / 10,
        condition: conditionText({ weatherCode: w.weatherCode, precip: w.precip, source: 'archive' }),
        tags: cal?.[date] ? calendarTags(cal[date]) : [],
      };
    }
  }

  let checks: { date: string; real: number; predicted: number; baseline: number | null }[] = [];
  if (active && !(store.isTest && !active.includesTestData)) {
    const real = new Map(records.map(r => [formatDate(r.date), r.clients]));
    checks = (JSON.parse(active.backtest || '[]') as { storeId: string; date: string; predicted: number; baseline?: number }[])
      .filter(b => b.storeId === store.id && real.has(b.date))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-CHECK_DAYS)
      .map(b => ({ date: b.date, real: real.get(b.date)!, predicted: b.predicted, baseline: b.baseline ?? null }));
  }

  const factors = active
    ? (JSON.parse(active.importances || '[]') as { feature: string; importance: number }[]).slice(0, 6)
    : [];

  return { storeAverage, example, factors, checks };
}

trainingRouter.get('/store/:storeId', async (req, res) => {
  const { storeId } = req.params;
  if (!canAccess(req, storeId)) return res.status(403).json({ error: 'Acceso denegado' });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return res.status(404).json({ error: 'Comercio no encontrado' });

  const [records, runs] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { storeId },
      select: { date: true, clients: true, estimated: true, createdAt: true },
      orderBy: { date: 'asc' },
    }),
    prisma.modelRun.findMany({ orderBy: { createdAt: 'desc' }, take: HISTORY_RUNS }),
  ]);
  const active = runs.find(r => r.active) ?? (await prisma.modelRun.findFirst({ where: { active: true } }));
  const history = runs.map(r => storeRunSummary(r, store, records));

  // Avance hacia el próximo reentrenamiento automático (RF-12): mismos filtros que usa jobs.ts
  let newSinceTraining = { all: 0, store: 0 };
  if (active) {
    const where = {
      createdAt: { gt: active.createdAt },
      ...(active.includesTestData ? {} : { store: { isTest: false } }),
      ...(active.excludeEstimated ? { estimated: false } : {}),
    };
    const [all, mine] = await Promise.all([
      prisma.dailyRecord.count({ where }),
      prisma.dailyRecord.count({ where: { ...where, storeId } }),
    ]);
    newSinceTraining = { all, store: mine };
  }

  const isStaff = req.auth!.role !== 'comerciante';
  const liveRecords = trainingStatus.storeRecords;
  res.json({
    store: { id: store.id, name: store.name, isTest: store.isTest },
    live: {
      running: trainingStatus.running,
      stage: trainingStatus.stage,
      startedAt: trainingStatus.startedAt?.toISOString() ?? null,
      algorithm: trainingStatus.algorithm,
      trigger: trainingStatus.trigger,
      /** null mientras se preparan los datos */
      storeRecords: liveRecords ? (liveRecords[storeId] ?? 0) : null,
      /** Solo para el equipo: cuántos comercios entran en el entrenamiento en curso */
      storesInTraining: isStaff && liveRecords ? Object.keys(liveRecords).length : null,
    },
    // El detalle técnico del error solo lo ve el equipo
    lastFailure: trainingStatus.lastFailure
      ? {
          at: trainingStatus.lastFailure.at.toISOString(),
          trigger: trainingStatus.lastFailure.trigger,
          message: isStaff ? trainingStatus.lastFailure.message : null,
        }
      : null,
    active: active ? storeRunSummary(active, store, records) : null,
    data: {
      records: records.length,
      estimated: records.filter(r => r.estimated).length,
      firstDate: records.length ? formatDate(records[0].date) : null,
      lastDate: records.length ? formatDate(records[records.length - 1].date) : null,
      minRecords: MIN_RECORDS,
      initialWindowDays: INITIAL_WINDOW_DAYS,
    },
    nextRetrain: {
      threshold: RETRAIN_MIN_NEW_RECORDS,
      newRecords: newSinceTraining.all,
      newRecordsStore: newSinceTraining.store,
      lastCheck: jobStatus.lastRun?.toISOString() ?? null,
    },
    history,
    explain: await buildExplain(active ?? null, store, records),
  });
});
