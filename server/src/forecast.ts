/** Predicciones del flujo de clientes con el modelo activo del servicio de ML. */
import { prisma } from './db.js';
import { conditionText, getWeather } from './weather.js';
import { mlPredict, MlError } from './ml.js';

export type FlowLevel = 'bajo' | 'normal' | 'alto' | 'crítico';

export interface DayPredictionDto {
  date: string;
  clients: number;
  clientsMin: number;
  clientsMax: number;
  flowLevel: FlowLevel;
  confidence: number;
  confidenceLabel: 'Alta confianza' | 'Confianza moderada' | 'Baja confianza';
  temperature: number;
  temperatureMin: number;
  precipitation: number;
  humidity: number;
  condition: string;
  weatherSource: 'archive' | 'forecast' | 'climatology';
  isQuincena: boolean;
  isEndOfMonth: boolean;
  isHoliday: boolean;
  holidayName?: string;
  event?: string;
  schoolBreak?: string;
  isSeason: string;
  factors: { name: string; impact: number; type: 'positive' | 'negative' }[];
  modelVersion: string;
  /** UC-04 flujo alterno: aviso cuando el comercio aún no tiene datos suficientes */
  dataWarning?: string;
}

/** Registros mínimos del comercio para considerar la predicción confiable (4 semanas). */
export const MIN_STORE_RECORDS = 28;

export interface Thresholds {
  bajo: number;
  normalMin: number;
  normalMax: number;
  alto: number;
  critico: number;
}

/** Umbrales iniciales relativos al promedio del comercio; el comerciante puede ajustarlos. */
export function defaultThresholds(avg: number): Thresholds {
  const a = Math.max(1, avg);
  const bajo = Math.max(1, Math.round(a * 0.8));
  const normalMax = Math.round(a * 1.25);
  return { bajo, normalMin: bajo, normalMax, alto: normalMax + 1, critico: Math.round(a * 1.6) };
}

export function flowLevel(clients: number, t: Thresholds): FlowLevel {
  if (clients > t.critico) return 'crítico';
  if (clients >= t.alto) return 'alto';
  if (clients < t.bajo) return 'bajo';
  return 'normal';
}

export async function getThresholds(storeId: string, avg: number): Promise<Thresholds> {
  const s = await prisma.alertSettings.findUnique({ where: { storeId } });
  if (s) return { bajo: s.bajo, normalMin: s.normalMin, normalMax: s.normalMax, alto: s.alto, critico: s.critico };
  const t = defaultThresholds(avg);
  await prisma.alertSettings.create({ data: { storeId, ...t } });
  return t;
}

/** Promedio real del comercio; si aún no tiene registros, usa el promedio declarado al registrarse. */
export async function storeBaseline(storeId: string) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new MlError('Comercio no encontrado', 404);
  const agg = await prisma.dailyRecord.aggregate({
    where: { storeId },
    _avg: { clients: true },
    _count: true,
  });
  const mean = agg._count > 0 && agg._avg.clients ? agg._avg.clients : store.avgDailyClients;
  return { store, mean, count: agg._count };
}

export async function activeModel() {
  return prisma.modelRun.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } });
}

export async function predictForStore(storeId: string, dates: string[]): Promise<DayPredictionDto[]> {
  if (!dates.length) return [];
  const model = await activeModel();
  if (!model) {
    throw new MlError('Aún no hay un modelo entrenado. Un analista debe entrenar el modelo primero.', 409);
  }
  const { store, mean, count } = await storeBaseline(storeId);
  if (!mean) {
    throw new MlError('El comercio no tiene datos suficientes para generar predicciones confiables.', 409);
  }
  const weather = await getWeather(dates);
  const usable = dates.filter(d => weather.has(d));
  if (!usable.length) {
    throw new MlError('No hay datos climáticos disponibles para las fechas solicitadas.', 503);
  }

  const preds = await mlPredict({
    version: model.version,
    rows: usable.map(d => {
      const w = weather.get(d)!;
      return {
        storeId,
        date: d,
        category: store.category,
        storeMean: mean,
        tmax: w.tmax,
        tmin: w.tmin,
        precip: w.precip,
        humidity: w.humidity,
      };
    }),
    storeRecords: { [storeId]: count },
    climatologyDates: usable.filter(d => weather.get(d)!.source === 'climatology'),
  });

  const thresholds = await getThresholds(storeId, mean);
  const dataWarning =
    count < MIN_STORE_RECORDS
      ? count === 0
        ? 'Tu comercio aún no tiene registros: esta estimación usa el promedio diario que declaraste y no es confiable. Registra el flujo de cada día en «Datos».'
        : `Tu comercio tiene ${count} de ${MIN_STORE_RECORDS} días registrados necesarios para una predicción confiable. Sigue registrando el flujo diario.`
      : undefined;
  return preds.map(p => {
    const w = weather.get(p.date)!;
    // Sin datos suficientes del comercio la confianza siempre es baja (UC-04).
    const conf = dataWarning ? Math.min(p.confidence, 60) : p.confidence;
    return {
      date: p.date,
      clients: p.clients,
      clientsMin: p.clientsMin,
      clientsMax: p.clientsMax,
      flowLevel: flowLevel(p.clients, thresholds),
      confidence: conf,
      confidenceLabel: conf >= 80 ? 'Alta confianza' : conf >= 65 ? 'Confianza moderada' : 'Baja confianza',
      temperature: w.tmax,
      temperatureMin: w.tmin,
      precipitation: w.precip,
      humidity: w.humidity,
      condition: conditionText(w),
      weatherSource: w.source,
      isQuincena: p.calendar.isQuincena,
      isEndOfMonth: p.calendar.isEndOfMonth,
      isHoliday: p.calendar.isHoliday,
      holidayName: p.calendar.holidayName ?? undefined,
      event: p.calendar.event ?? undefined,
      schoolBreak: p.calendar.schoolBreak ?? undefined,
      isSeason: p.calendar.season,
      factors: p.factors,
      modelVersion: model.version,
      dataWarning,
    };
  });
}

export function computeMetrics(pairs: { real: number; predicted: number }[]) {
  const n = pairs.length;
  if (!n) return { mae: 0, rmse: 0, r2: 0, mape: 0, n: 0 };
  const mae = pairs.reduce((a, p) => a + Math.abs(p.real - p.predicted), 0) / n;
  const rmse = Math.sqrt(pairs.reduce((a, p) => a + (p.real - p.predicted) ** 2, 0) / n);
  const mean = pairs.reduce((a, p) => a + p.real, 0) / n;
  const ssTot = pairs.reduce((a, p) => a + (p.real - mean) ** 2, 0);
  const ssRes = pairs.reduce((a, p) => a + (p.real - p.predicted) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const mape =
    (pairs.reduce((a, p) => a + (p.real ? Math.abs(p.real - p.predicted) / p.real : 0), 0) / n) * 100;
  return {
    mae: Math.round(mae * 100) / 100,
    rmse: Math.round(rmse * 100) / 100,
    r2: Math.round(r2 * 1000) / 1000,
    mape: Math.round(mape * 10) / 10,
    n,
  };
}
