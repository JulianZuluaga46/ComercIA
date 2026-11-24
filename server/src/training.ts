/** Entrenamiento del modelo: arma el dataset (registros reales + clima de Open-Meteo) y llama al servicio ML. */
import { prisma } from './db.js';
import { formatDate } from './dates.js';
import { mlTrain, MlError, type MlRecord } from './ml.js';
import { syncWeather } from './weather.js';

export const ALGORITHM_LABELS: Record<string, string> = {
  rf: 'Random Forest',
  xgb: 'XGBoost',
  lstm: 'LSTM',
};

export type TrainStage = 'preparando' | 'entrenando' | 'guardando';
export type TrainTrigger = 'manual' | 'automatico';

/** Estado en vivo del entrenamiento, para que comerciantes y analistas vean lo que está pasando. */
export const trainingStatus = {
  running: false,
  stage: null as TrainStage | null,
  startedAt: null as Date | null,
  algorithm: null as string | null,
  trigger: null as TrainTrigger | null,
  /** Registros por comercio incluidos en el entrenamiento en curso (se conoce tras preparar los datos) */
  storeRecords: null as Record<string, number> | null,
  lastFinishedAt: null as Date | null,
  lastFailure: null as { at: Date; message: string; trigger: TrainTrigger } | null,
};

export interface TrainOptions {
  excludeEstimated?: boolean;
  /** Incluir comercios de prueba (datos inventados). Por defecto no, para no contaminar métricas reales. */
  includeTestData?: boolean;
  /** Quién lo inició: el analista (manual) o el sistema (RF-12) */
  trigger?: TrainTrigger;
}

export async function buildDataset({ excludeEstimated = false, includeTestData = false }: TrainOptions) {
  const records = await prisma.dailyRecord.findMany({
    where: {
      ...(excludeEstimated ? { estimated: false } : {}),
      ...(includeTestData ? {} : { store: { isTest: false } }),
    },
    include: { store: { select: { category: true } } },
    orderBy: { date: 'asc' },
  });
  const dates = [...new Set(records.map(r => formatDate(r.date)))];
  let weather = await prisma.weatherDaily.findMany({ where: { date: { in: dates } } });
  if (weather.length < dates.length) {
    await syncWeather().catch(() => {});
    weather = await prisma.weatherDaily.findMany({ where: { date: { in: dates } } });
  }
  const wmap = new Map(weather.map(w => [w.date, w]));
  const rows: MlRecord[] = [];
  let missingWeather = 0;
  for (const r of records) {
    const d = formatDate(r.date);
    const w = wmap.get(d);
    if (!w) {
      missingWeather++;
      continue;
    }
    rows.push({
      storeId: r.storeId,
      date: d,
      category: r.store.category,
      clients: r.clients,
      tmax: w.tmax,
      tmin: w.tmin,
      precip: w.precip,
      humidity: w.humidity,
    });
  }
  return { rows, missingWeather, estimated: records.filter(r => r.estimated).length };
}

export async function trainModel(algorithmKey: string, opts: TrainOptions = {}) {
  if (trainingStatus.running) throw new MlError('Ya hay un entrenamiento en curso. Intente en unos segundos.', 409);
  const excludeEstimated = !!opts.excludeEstimated;
  const includeTestData = !!opts.includeTestData;
  const trigger = opts.trigger ?? 'manual';
  Object.assign(trainingStatus, {
    running: true,
    stage: 'preparando',
    startedAt: new Date(),
    algorithm: ALGORITHM_LABELS[algorithmKey] ?? algorithmKey,
    trigger,
    storeRecords: null,
  });
  try {
    const { rows, missingWeather } = await buildDataset({ excludeEstimated, includeTestData });
    const perStore: Record<string, number> = {};
    for (const r of rows) perStore[r.storeId] = (perStore[r.storeId] ?? 0) + 1;
    trainingStatus.storeRecords = perStore;
    const count = await prisma.modelRun.count();
    const version = `v${count + 1}`;

    trainingStatus.stage = 'entrenando';
    const result = await mlTrain({ algorithm: algorithmKey, version, records: rows });
    trainingStatus.stage = 'guardando';

    await prisma.modelRun.updateMany({ data: { active: false } });
    const run = await prisma.modelRun.create({
      data: {
        version,
        algorithm: result.algorithm,
        algorithmKey,
        mae: result.metrics.mae,
        rmse: result.metrics.rmse,
        r2: result.metrics.r2,
        mape: result.metrics.mape,
        baselineMae: result.baseline.mae,
        baselineRmse: result.baseline.rmse,
        baselineMape: result.baseline.mape,
        evaluated: result.metrics.n,
        records: result.records,
        excludeEstimated,
        includesTestData: includeTestData,
        importances: JSON.stringify(result.importances),
        backtest: JSON.stringify(result.backtest),
        trainedThrough: result.trainedThrough,
        durationMs: result.durationMs,
        active: true,
      },
    });
    await applyBacktest(run.version, result.backtest);

    const better = run.mae < run.baselineMae;
    const analysts = await prisma.user.findMany({ where: { role: { in: ['analista', 'admin'] } } });
    await prisma.notification.createMany({
      data: analysts.map(u => ({
        userId: u.id,
        type: better ? 'success' : 'warning',
        title: `Modelo ${run.version} entrenado (${run.algorithm})`,
        message:
          `MAE ${run.mae} vs. ${run.baselineMae} del método empírico (promedio por día de la semana) ` +
          `sobre ${run.evaluated} días de validación.` +
          (missingWeather ? ` ${missingWeather} registros sin clima fueron omitidos.` : ''),
      })),
    });
    trainingStatus.lastFailure = null;
    return { run, missingWeather };
  } catch (err) {
    trainingStatus.lastFailure = { at: new Date(), message: (err as Error).message, trigger };
    throw err;
  } finally {
    Object.assign(trainingStatus, { running: false, stage: null, storeRecords: null, lastFinishedAt: new Date() });
  }
}

const VALIDATION_SUFFIX = ' (validación)';

/**
 * Escribe en el histórico las predicciones de validación del modelo activo (RF-14).
 * No toca las predicciones hechas antes de conocer el dato real (predictedBy sin sufijo).
 */
export async function applyBacktest(version: string, backtest: { storeId: string; date: string; predicted: number }[]) {
  await prisma.$transaction([
    prisma.dailyRecord.updateMany({
      where: { predictedBy: { endsWith: VALIDATION_SUFFIX } },
      data: { predicted: null, predictedBy: null },
    }),
    ...backtest.map(b =>
      prisma.dailyRecord.updateMany({
        where: { storeId: b.storeId, date: new Date(`${b.date}T12:00:00`), predictedBy: null },
        data: { predicted: b.predicted, predictedBy: `${version}${VALIDATION_SUFFIX}` },
      }),
    ),
  ]);
}

export function mapModelRun(r: Awaited<ReturnType<typeof prisma.modelRun.findFirst>> & {}) {
  const { backtest: _backtest, ...rest } = r;
  return {
    ...rest,
    importances: JSON.parse(r.importances || '[]') as { feature: string; importance: number }[],
    createdAt: r.createdAt.toISOString(),
  };
}
