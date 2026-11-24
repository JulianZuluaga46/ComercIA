/**
 * Clima diario real de Montería desde Open-Meteo (https://open-meteo.com, sin API key).
 * - Histórico: archive-api (reanálisis ERA5), desde 2021 para tener climatología.
 * - Reciente y pronóstico: api.open-meteo.com (últimos 14 días + 16 días adelante).
 * Para fechas más allá del pronóstico se usa la climatología: promedio de años anteriores
 * en una ventana de ±7 días alrededor del mismo día del año (marcado como 'climatology').
 */
import { prisma } from './db.js';
import { addDays, formatDate, parseDate, todayStr } from './dates.js';

const LAT = 8.7575;
const LNG = -75.8877;
const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,weather_code';
const ARCHIVE_START = '2021-01-01';
const FORECAST_DAYS = 16;

export type WeatherSource = 'archive' | 'forecast' | 'climatology';

export interface DayWeather {
  date: string;
  tmax: number;
  tmin: number;
  precip: number;
  humidity: number;
  weatherCode: number;
  source: WeatherSource;
}

let lastSync: { at: Date; ok: boolean; message: string } | null = null;
export function weatherStatus() {
  return lastSync;
}

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
  relative_humidity_2m_mean: (number | null)[];
  weather_code: (number | null)[];
}

async function fetchDaily(base: string, params: Record<string, string>): Promise<OpenMeteoDaily> {
  const qs = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LNG),
    daily: DAILY,
    timezone: 'America/Bogota',
    ...params,
  });
  const res = await fetch(`${base}?${qs}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { daily: OpenMeteoDaily };
  return json.daily;
}

async function upsertDaily(daily: OpenMeteoDaily, source: 'archive' | 'forecast') {
  let n = 0;
  for (let i = 0; i < daily.time.length; i++) {
    const tmax = daily.temperature_2m_max[i];
    const tmin = daily.temperature_2m_min[i];
    const precip = daily.precipitation_sum[i];
    const hum = daily.relative_humidity_2m_mean[i];
    if (tmax == null || tmin == null || precip == null || hum == null) continue;
    const date = daily.time[i];
    const data = {
      tmax,
      tmin,
      precip,
      humidity: hum,
      weatherCode: daily.weather_code[i] ?? 0,
      source,
    };
    if (source === 'forecast') {
      // No sobrescribir datos de archivo (más confiables) con pronóstico.
      const existing = await prisma.weatherDaily.findUnique({ where: { date } });
      if (existing?.source === 'archive') continue;
    }
    await prisma.weatherDaily.upsert({ where: { date }, create: { date, ...data }, update: data });
    n++;
  }
  return n;
}

/** Sincroniza histórico y pronóstico. Seguro de llamar varias veces. */
export async function syncWeather(): Promise<{ archive: number; forecast: number }> {
  try {
    const latestArchive = await prisma.weatherDaily.findFirst({
      where: { source: 'archive' },
      orderBy: { date: 'desc' },
    });
    // El archivo ERA5 tiene ~5 días de rezago.
    const archiveEnd = addDays(todayStr(), -6);
    const archiveStart = latestArchive ? addDays(latestArchive.date, -10) : ARCHIVE_START;
    let archive = 0;
    if (archiveStart <= archiveEnd) {
      const d = await fetchDaily('https://archive-api.open-meteo.com/v1/archive', {
        start_date: archiveStart,
        end_date: archiveEnd,
      });
      archive = await upsertDaily(d, 'archive');
    }
    const f = await fetchDaily('https://api.open-meteo.com/v1/forecast', {
      past_days: '14',
      forecast_days: String(FORECAST_DAYS),
    });
    const forecast = await upsertDaily(f, 'forecast');
    lastSync = { at: new Date(), ok: true, message: `archivo +${archive}, pronóstico +${forecast}` };
    console.log(`[clima] Open-Meteo sincronizado: ${lastSync.message}`);
    return { archive, forecast };
  } catch (err) {
    lastSync = { at: new Date(), ok: false, message: (err as Error).message };
    console.error('[clima] Error sincronizando Open-Meteo:', (err as Error).message);
    throw err;
  }
}

function dayOfYear(s: string): number {
  const d = parseDate(s);
  const start = new Date(d.getFullYear(), 0, 1, 12);
  return Math.round((d.getTime() - start.getTime()) / 86400000);
}

/** Promedio de años anteriores ±7 días alrededor del mismo día del año. */
async function climatology(dates: string[]): Promise<Map<string, DayWeather>> {
  const out = new Map<string, DayWeather>();
  if (!dates.length) return out;
  const archive = await prisma.weatherDaily.findMany({ where: { source: 'archive' } });
  if (!archive.length) return out;
  const byDoy = archive.map(r => ({ doy: dayOfYear(r.date), r }));
  for (const date of dates) {
    const doy = dayOfYear(date);
    const near = byDoy.filter(x => {
      const diff = Math.abs(x.doy - doy);
      return Math.min(diff, 365 - diff) <= 7;
    });
    if (!near.length) continue;
    const avg = (f: (r: (typeof archive)[number]) => number) =>
      Math.round((near.reduce((a, x) => a + f(x.r), 0) / near.length) * 10) / 10;
    const precip = avg(r => r.precip);
    out.set(date, {
      date,
      tmax: avg(r => r.tmax),
      tmin: avg(r => r.tmin),
      precip,
      humidity: avg(r => r.humidity),
      weatherCode: precip >= 5 ? 61 : precip >= 1 ? 51 : 2,
      source: 'climatology',
    });
  }
  return out;
}

export async function getWeather(dates: string[]): Promise<Map<string, DayWeather>> {
  const rows = await prisma.weatherDaily.findMany({ where: { date: { in: dates } } });
  const map = new Map<string, DayWeather>(
    rows.map(r => [
      r.date,
      {
        date: r.date,
        tmax: r.tmax,
        tmin: r.tmin,
        precip: r.precip,
        humidity: r.humidity,
        weatherCode: r.weatherCode,
        source: r.source as WeatherSource,
      },
    ]),
  );
  const missing = dates.filter(d => !map.has(d));
  if (missing.length) {
    for (const [k, v] of await climatology(missing)) map.set(k, v);
  }
  return map;
}

/** Códigos WMO de Open-Meteo a texto. */
export function conditionText(w: Pick<DayWeather, 'weatherCode' | 'precip' | 'source'>): string {
  if (w.source === 'climatology') {
    if (w.precip >= 5) return 'Lluvia probable (promedio histórico)';
    if (w.precip >= 1) return 'Lluvia aislada (promedio histórico)';
    return 'Mayormente seco (promedio histórico)';
  }
  const c = w.weatherCode;
  if (c >= 95) return 'Lluvia con tormenta';
  if (c >= 80) return 'Chubascos';
  if (c >= 61) return w.precip >= 10 ? 'Lluvia fuerte' : 'Lluvia';
  if (c >= 51) return 'Llovizna';
  if (c >= 45) return 'Neblina';
  if (c === 3) return 'Nublado';
  if (c >= 1) return 'Parcialmente nublado';
  return 'Soleado';
}

export { formatDate };
